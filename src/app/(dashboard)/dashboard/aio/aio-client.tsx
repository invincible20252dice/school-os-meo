"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { measurementState, type AioViewData, type MeasurementView } from "@/lib/aio-view";
import { aggregateAio, aioHistory, extractCompetitors } from "@/lib/aio-insights";
import { aioCost } from "@/lib/aio-audit";
import { AioComparison } from "./comparison";
import styles from "./live.module.css";

class AioUiError extends Error {
  constructor(message: string, public readonly code?: string) { super(message); }
}
async function api(url: string, signal: AbortSignal, body?: unknown) {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  if (!data.session) throw new AioUiError("ログインしてください。");
  signal.throwIfAborted();
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", signal,
    headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  if (!response.ok || !result.success) throw new AioUiError(result.error || "計測データを取得・保存できませんでした。", result.code);
  return result;
}
const date = (value: string) => new Date(value).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

function SchoolAio({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<AioViewData | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState(""), [retry, setRetry] = useState(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null), saving = useRef(false);
  const pending = useRef<{ keywordId: string; requestId: string } | null>(null);
  const [detail, setDetail] = useState<{ keywordId: string; record: MeasurementView } | null>(null);
  const detailRequest = useRef(0);
  const endpoint = `/api/dashboard/aio?schoolId=${encodeURIComponent(schoolId)}`;
  const href = (path: string) => `${path}${path.includes("?") ? "&" : "?"}schoolId=${encodeURIComponent(schoolId)}`;
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setError(""); setData(null);
    if (!schoolId || schoolId === "all") { setError("校舎を選択してください。"); return () => abort.abort(); }
    void api(endpoint, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      setData(result); setSelected(previous => result.keywords.some((row: { id: string }) => row.id === previous) ? previous : result.keywords[0]?.id || "");
    }).catch(error => { if (!abort.signal.aborted) setError(error instanceof AioUiError ? error.message : "計測データを取得できませんでした。ログイン・DB接続・設定を確認してください。"); });
    return () => abort.abort();
  }, [schoolId, endpoint, retry]);
  const keyword = data?.keywords.find(row => row.id === selected), record = keyword?.latest || null;
  const state = measurementState(record, data?.configured || false);
  const totals = aggregateAio(data?.keywords.map(k => k.latest) || []), history = aioHistory(data?.keywords || []);
  const disabled = busy || data?.keywords.some(k => measurementState(k.latest, true).label === "計測中") || !data?.configured || !data.canMeasure;
  const cost = record?.usage ? aioCost(record.usage, record.model) : null;

  async function historyDetail(id: string) {
    const requestNumber = ++detailRequest.current, keywordId = selected, signal = controller.current!.signal;
    try {
      const result = await api(`${endpoint}&measurementId=${encodeURIComponent(id)}`, signal);
      if (requestNumber === detailRequest.current && !signal.aborted) { setDetail({ keywordId, record: result.measurement }); setNotice(""); }
    } catch { if (requestNumber === detailRequest.current && !signal.aborted) setNotice("過去の回答を取得できませんでした。実測は再実行していません。"); }
  }

  async function measure(ids: string[]) {
    if (saving.current || disabled) return;
    const signal = controller.current!.signal;
    saving.current = true; setBusy(true); setNotice("");
    let persisted = false;
    try {
      for (let i = 0; i < ids.length; i++) {
        signal.throwIfAborted(); setNotice(`計測中 ${i + 1} / ${ids.length}`);
        if (pending.current?.keywordId !== ids[i]) pending.current = { keywordId: ids[i], requestId: crypto.randomUUID() };
        persisted = false;
        await api(endpoint, signal, pending.current);
        persisted = true; pending.current = null;
        const result = await api(endpoint, signal);
        signal.throwIfAborted(); setData(result);
      }
      setNotice(`計測状態を更新しました。${ids.length} / ${ids.length}件確認（直近10分の同一キーワードは既存結果を再利用）。`);
    } catch (error) {
      if (!signal.aborted) setNotice(persisted ? "保存済みですが再取得できませんでした。再取得してください。" : error instanceof AioUiError ? error.message : "計測を完了できませんでした。再取得して状態を確認してください。");
    } finally { saving.current = false; if (!signal.aborted) setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.header}><h1>AIOスコア分析</h1><button type="button" onClick={() => setRetry(value => value + 1)} disabled={busy}>再取得</button></header>
    {error ? <p role="alert" className={styles.error}>{error}</p> : !data ? <p role="status">読み込み中</p> : <>
      <section className={styles.selection}><label>登録キーワード<select aria-label="登録キーワード" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setNotice(""); }}>{data.keywords.map(row => <option key={row.id} value={row.id}>{row.keyword}</option>)}</select></label><span>登録 {data.keywords.length}件</span><Link href={href("/dashboard/keywords")}>キーワード管理</Link></section>
      {!data.keywords.length ? <p>登録キーワードがありません。</p> : keyword ? <>
        <section className={styles.metrics} aria-label="provider別の計測状態">
          <article><h2>OpenAI検索回答の推奨率</h2><strong>{totals.rate === null ? "—" : `${totals.rate}%`}</strong><span>{totals.rate === null ? state.label : "計測成功"}</span><small>{totals.recommended} / {totals.successful}成功計測で推奨</small>{totals.failed ? <small>計測失敗 {totals.failed}件</small> : null}{!data.configured && record ? <small>API設定が必要</small> : null}</article>
          <article><h2>Gemini</h2><strong>—</strong><span>未対応・未計測</span></article><article><h2>Google AI Overview</h2><strong>—</strong><span>未対応・未計測</span></article>
        </section>
        <p className={styles.caption}>対象：OpenAI APIの検索付き回答。公開版ChatGPTの表示順位ではありません。各キーワードの最新の試行を採用し、成功した計測のみを割合の分母にしています。</p>
        <div className={styles.header}><button type="button" onClick={() => void measure([keyword.id])} disabled={disabled}>このキーワードを計測</button><button type="button" onClick={() => void measure(data.keywords.map(k => k.id))} disabled={disabled}>OpenAIで{data.keywords.length}件を計測</button></div>
        <p className={styles.caption}>1校舎につき24時間で5回まで。直近10分の同一キーワードは再課金せず既存結果を表示します。</p><p role="status">{notice}</p>
        <section className={styles.section} aria-label="改善余地がある検索テーマ"><h2>改善余地がある検索テーマ</h2>
          {totals.allRecommended ? <p>現在、OpenAI検索回答では登録キーワードすべてで推奨されています。</p> : null}
          {data.keywords.filter(k => measurementState(k.latest, true).label === "計測成功" && !k.latest!.recommended).map(k => <div className={styles.theme} key={k.id}><h3>{k.keyword}</h3><p>OpenAI検索回答：推奨なし</p></div>)}
          {!totals.successful ? <p>計測成功後に改善テーマを確認できます。</p> : null}
        </section>
        <AioComparison data={data} schoolId={schoolId} requestPlaces={data.canMeasure ? requestId => api(`/api/dashboard/aio/places?schoolId=${encodeURIComponent(schoolId)}`, controller.current!.signal, { requestId }) : undefined} />
        <section className={styles.section}><h2>キーワード別結果</h2><div className={styles.tableScroll}><table><thead><tr><th>キーワード</th><th>OpenAI</th><th>最終試行日時</th></tr></thead><tbody>{data.keywords.map(k => {
          const s = measurementState(k.latest, data.configured);
          return <tr key={k.id}><th><button disabled={busy} onClick={() => setSelected(k.id)}>{k.keyword}</button></th><td>{s.label === "計測成功" ? k.latest!.recommended ? "推奨あり" : "推奨なし" : `— / ${s.label}`}</td><td>{k.latest ? date(k.latest.measuredAt || k.latest.createdAt) : "—"}</td></tr>;
        })}</tbody></table></div></section>
        <section className={styles.section} aria-label="選択キーワードの計測結果"><h2>選択キーワードの計測結果</h2><p>{keyword.keyword}</p>
          {state.label === "計測失敗" ? <p role="alert" className={styles.error}>計測失敗{record?.errorCode ? `（${record.errorCode}）` : ""}</p> : null}
          {record && state.label === "計測成功" ? <>
            {record.recommended ? <p>現在この検索テーマでは推奨されています。</p> : null}
            <dl className={styles.facts}><div><dt>自塾表示</dt><dd>{record.brandDetected ? "あり" : "なし"}</dd></div><div><dt>推奨判定</dt><dd>{record.recommended ? "あり" : "なし"}</dd></div><div><dt>モデル</dt><dd>{record.model}</dd></div><div><dt>計測日時</dt><dd><time dateTime={record.measuredAt!}>{date(record.measuredAt!)}</time></dd></div></dl>
            <details><summary>AI回答を見る</summary><h3>検索質問</h3><p className={styles.response}>{record.query}</p><h3>API回答</h3><p className={styles.response}>{record.response}</p>{record.evidence ? <><h3>推奨判定の根拠</h3><blockquote>{record.evidence}</blockquote></> : null}</details>
            <details><summary>出典を見る（{record.citations?.length || 0}件）</summary><ul>{record.citations?.map(citation => <li key={citation.url}><a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title}</a></li>)}</ul></details>
          </> : null}
          {record ? <details><summary>API利用記録</summary><p>モデル：{record.model}</p>{record.usage ? <><p>リクエスト {record.usage.requests}回 / 検索 {record.usage.searchCalls}回 / {record.usage.usageComplete ? `入力 ${record.usage.inputTokens}・出力 ${record.usage.outputTokens} tokens` : "トークン使用量：一部または全部が未取得"}</p><p>{cost ? `概算 $${cost.lower.toFixed(4)}～$${cost.upper.toFixed(4)} USD（2026-10-09単価、検索トークン重複の有無による幅。請求額ではありません）` : "概算費用：不明（使用量未取得・失敗・未対応モデル）"}</p></> : <p>この既存記録には使用量情報がありません。</p>}</details> : null}
        </section>
        <section className={styles.section}><h2>OpenAI推奨率の推移</h2>{!history.length ? <p>まだ計測履歴がありません</p> : <>
          <svg className={styles.chart} viewBox="0 0 640 180" role="img" aria-label="日別OpenAI推奨率の推移"><title>日本時間の日末、成功計測のみを分母にした推奨率</title>{[0, 50, 100].map(v => <g key={v}><line x1="50" x2="620" y1={145 - v * 1.2} y2={145 - v * 1.2} stroke="#dbe1e3" /><text x="5" y={150 - v * 1.2} fontSize="12">{v}</text></g>)}
            {history.map((p, i) => { const x = 60 + i * 540 / Math.max(1, history.length - 1), prev = history[i - 1]; return p.rate === null ? null : <g key={p.date}>{prev && prev.rate !== null ? <line x1={60 + (i - 1) * 540 / Math.max(1, history.length - 1)} y1={145 - prev.rate * 1.2} x2={x} y2={145 - p.rate * 1.2} stroke="#247a64" strokeWidth="2" /> : null}<circle cx={x} cy={145 - p.rate * 1.2} r="4" fill="#247a64"><title>{p.date}：{p.rate}%</title></circle></g>; })}<text x="60" y="172" fontSize="12">{history[0].date}</text>{history.length > 1 ? <text x="600" y="172" textAnchor="end" fontSize="12">{history.at(-1)!.date}</text> : null}</svg>
          <details><summary>日別の値を見る</summary><ul>{history.map(p => <li key={p.date}>{p.date}：{p.rate === null ? "— / 成功計測なし" : `${p.rate}%`}（{p.recommended}/{p.successful}成功、失敗{p.failed}）</li>)}</ul></details></>}
          <p className={styles.caption}>各キーワード最新50試行の表示範囲内で、日本時間の日末の最新状態を集計。未計測・失敗は0%にしません。現在有効なキーワードが対象です。</p>{data.keywords.some(k => k.historyTruncated) ? <p>古い履歴は表示範囲外です。保存データは削除していません。</p> : null}
          <details><summary>選択キーワードの履歴</summary><ul>{keyword.history?.map(r => <li key={r.id}>{date(r.measuredAt || r.createdAt)}：{measurementState(r, true).label} / {measurementState(r, true).value} <button type="button" onClick={() => void historyDetail(r.id)}>保存回答を開く</button></li>)}</ul></details>
          {detail?.keywordId === selected ? <article aria-label="過去の保存回答"><h3>{date(detail.record.measuredAt || detail.record.createdAt)}の保存回答</h3><p>{measurementState(detail.record, true).label} / {measurementState(detail.record, true).value}</p><p className={styles.response}>{detail.record.response || "回答なし"}</p><ul>{detail.record.citations?.map(c => <li key={c.url}><a href={c.url} target="_blank" rel="noopener noreferrer">{c.title}</a></li>)}</ul><p>回答内の競合候補：{extractCompetitors(detail.record.response || "", detail.record.schoolName || "").map(c => c.name).join("、") || "未抽出"}</p></article> : null}
        </section><section className={styles.section}><h2>総合AIOスコア</h2><p>— / 一部provider未計測</p></section>
      </> : null}
    </>}
  </main>;
}
export default function AioClient() { const schoolId = useSearchParams().get("schoolId") || ""; return <SchoolAio key={schoolId} schoolId={schoolId} />; }
