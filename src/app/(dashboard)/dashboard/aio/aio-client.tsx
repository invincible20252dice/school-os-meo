"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { measurementState, type AioViewData } from "@/lib/aio-view";
import styles from "./live.module.css";

class AioUiError extends Error {}
async function api(url: string, signal: AbortSignal, body?: unknown) {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  if (!data.session) throw new AioUiError("ログインしてください。");
  signal.throwIfAborted();
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new AioUiError(result.error || "計測データを取得・保存できませんでした。");
  return result;
}

function SchoolAio({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<AioViewData | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState(""), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null), saving = useRef(false);
  const pending = useRef<{ keywordId: string; requestId: string } | null>(null);
  const endpoint = `/api/dashboard/aio?schoolId=${encodeURIComponent(schoolId)}`;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setError(""); setData(null);
    if (!schoolId || schoolId === "all") { setError("校舎を選択してください。"); return () => abort.abort(); }
    void api(endpoint, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setData(result);
      setSelected(previous => result.keywords.some((row: { id: string }) => row.id === previous) ? previous : result.keywords.some((row: { id: string }) => row.id === result.pilotKeywordId) ? result.pilotKeywordId : result.keywords[0]?.id || "");
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof AioUiError ? error.message : "計測データを取得できませんでした。ログイン・DB接続・設定を確認してください。"); });
    return () => abort.abort();
  }, [schoolId, endpoint, retry]);
  const keyword = data?.keywords.find(row => row.id === selected);
  const record = keyword?.latest || null;
  const state = measurementState(record, data?.configured || false);
  const running = state.label === "計測中";

  async function measure() {
    if (!keyword || saving.current || !data?.canMeasure || record || keyword.id !== data.pilotKeywordId) return;
    const signal = controller.current!.signal;
    saving.current = true; setBusy(true); setNotice("");
    if (pending.current?.keywordId !== keyword.id) pending.current = { keywordId: keyword.id, requestId: crypto.randomUUID() };
    let persisted = false;
    try {
      await api(endpoint, signal, pending.current);
      persisted = true; pending.current = null;
      const result = await api(endpoint, signal);
      if (!signal.aborted) { setData(result); setNotice("計測状態を更新しました。"); }
    } catch (error) {
      if (!signal.aborted) setNotice(persisted ? "保存済みですが再取得できませんでした。再取得してください。" : error instanceof AioUiError ? error.message : "計測を完了できませんでした。再取得して状態を確認してください。");
    } finally { saving.current = false; if (!signal.aborted) setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.header}><h1>AIOスコア分析</h1><button type="button" onClick={() => setRetry(value => value + 1)} disabled={busy}>再取得</button></header>
    {error ? <p role="alert" className={styles.error}>{error}</p> : !data ? <p role="status">読み込み中</p> : <>
      <section className={styles.selection}><label>登録キーワード<select aria-label="登録キーワード" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setNotice(""); }}>{data.keywords.map(row => <option key={row.id} value={row.id}>{row.keyword} / {row.municipality}</option>)}</select></label>
        <span>登録 {data.keywords.length}件</span><Link href={`/dashboard/keywords?schoolId=${encodeURIComponent(schoolId)}`}>キーワード管理</Link>
      </section>
      {!data.keywords.length ? <p>登録キーワードがありません。</p> : keyword ? <>
        <section className={styles.metrics} aria-label="provider別の計測状態">
          <article><h2>OpenAI検索回答の推奨率</h2><strong>{state.value}</strong><span>{state.label}</span>
            {state.label === "計測成功" ? <small>選択キーワード：推奨 {record!.recommended ? 1 : 0}件 / 計測成功 1件</small> : null}
            {!data.configured && record ? <small>API設定が必要</small> : null}
          </article>
          <article><h2>Gemini</h2><strong>—</strong><span>未対応・未計測</span></article>
          <article><h2>Google AI Overview</h2><strong>—</strong><span>未対応・未計測</span></article>
        </section>
        <section className={styles.section}>
          <div className={styles.header}><h2>選択キーワードの計測結果</h2><button type="button" onClick={() => void measure()} disabled={busy || running || !data.configured || !data.canMeasure || Boolean(record) || data.pilotKeywordId !== keyword.id}>{busy ? "計測中" : "1件を計測"}</button></div>
          <p className={styles.caption}>対象：OpenAI APIの検索付き回答。公開版ChatGPTの表示順位ではありません。</p>
          {data.pilotKeywordId && data.pilotKeywordId !== keyword.id ? <p>先行検証キーワードの実測確認待ち</p> : null}
          <p role="status">{notice}</p>
          {state.label === "計測失敗" ? <p role="alert" className={styles.error}>計測失敗{record?.errorCode ? `（${record.errorCode}）` : ""}</p> : null}
          {record && state.label === "計測成功" ? <>
            <dl className={styles.facts}><div><dt>自塾表示</dt><dd>{record.brandDetected ? "あり" : "なし"}</dd></div><div><dt>推奨判定</dt><dd>{record.recommended ? "あり" : "なし"}</dd></div><div><dt>モデル</dt><dd>{record.model}</dd></div><div><dt>計測日時</dt><dd><time dateTime={record.measuredAt!}>{new Date(record.measuredAt!).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</time></dd></div></dl>
            <h3>検索質問</h3><p className={styles.response}>{record.query}</p>
            <h3>API回答</h3><p className={styles.response}>{record.response}</p>
            {record.evidence ? <><h3>推奨判定の根拠</h3><blockquote>{record.evidence}</blockquote></> : null}
            <ul>{record.citations?.map(citation => <li key={citation.url}><a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a></li>)}</ul>
            <p className={styles.caption}>校舎名の一致とAIによる推奨判定。判定根拠は回答本文の引用です。</p>
          </> : null}
        </section>
        <section className={styles.section}><h2>総合AIOスコア・推移・競合比較</h2><p>— / 未計測</p></section>
      </> : null}
    </>}
  </main>;
}
export default function AioClient() {
  const schoolId = useSearchParams().get("schoolId") || "";
  return <SchoolAio key={schoolId} schoolId={schoolId} />;
}
