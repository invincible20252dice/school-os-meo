"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { DashboardOverview } from "@/lib/dashboard-summary";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./page.module.css";

type LoadState = { key: string; data: DashboardOverview | null; error: string | null };
const signed = (value: number) => value > 0 ? `+${value}` : String(value);

export default function OverviewClient() {
  const params = useSearchParams();
  const schoolId = params.get("schoolId") || "";
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ key: "", data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key: schoolId, data: null, error: null });
    async function load() {
      try {
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        if (!data.session?.access_token) throw new Error("ログイン後にダッシュボードを確認してください。");
        const response = await fetch(`/api/dashboard/overview${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`, {
          headers: { authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || body?.success !== true || !body.summary) throw new Error(body?.error || "ダッシュボードの集計データを取得できませんでした。");
        if (!controller.signal.aborted) setState({ key: schoolId, data: body, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key: schoolId, data: null, error: error instanceof Error ? error.message : "ダッシュボードの集計データを取得できませんでした。" });
      }
    }
    void load();
    return () => controller.abort();
  }, [schoolId, retry]);
  const current = state.key === schoolId ? state : null;
  const data = current?.data;
  const summary = data?.summary;
  const href = (path: string) => `${path}?schoolId=${encodeURIComponent(data?.schoolId ?? "all")}`;
  return <main className={styles.page}>
    <header className={styles.hero}>
      <p className={styles.kicker}>Overview</p><h1>店舗運用ダッシュボード</h1>
      {data ? <p>{data.schoolName}{data.schoolId === null ? `（${data.schoolCount}校舎）` : ""}</p> : null}
      <button className={styles.refresh} type="button" onClick={() => setRetry(value => value + 1)}>再取得</button>
    </header>
    {current?.error ? <p role="alert" className={styles.error}>{current.error}</p> : !summary ? <p role="status">ダッシュボードを読み込んでいます。</p> : null}
    {summary ? <>
      <section className={styles.cardGrid} aria-label="校舎の運用指標">
        <article className={styles.card}><span>登録口コミ</span><strong>{summary.reviews.count}件</strong>
          <p>平均評価 {summary.reviews.rating === null ? "未評価" : summary.reviews.rating.toFixed(1)}</p>
          <small>{summary.month}：{summary.reviews.monthlyCount}件 / 前月：{summary.reviews.previousCount}件（{signed(summary.reviews.difference)}件）</small>
        </article>
        <article className={styles.card}><span>最新MEO計測</span><strong>{summary.meo ? summary.meo.rank === null ? "圏外" : `${summary.meo.rank}位` : "未計測"}</strong>
          <p>{summary.meo?.keyword ?? "計測履歴なし"}</p>
          <small>{summary.meo?.difference == null ? "比較データなし" : `前回比 ${signed(summary.meo.difference)}位`}</small>
          <Link href={href("/dashboard/rankings")}>順位を確認</Link>
        </article>
        <article className={styles.card}><span>AIO平均スコア</span><strong>{summary.aio ? `${summary.aio.score}%` : "未計測"}</strong>
          {summary.aio ? <><p>ChatGPT {summary.aio.chatGpt}% / Gemini {summary.aio.gemini}%</p><small>Google AI {summary.aio.googleAi}% / {summary.aio.keywordCount}キーワード</small></> : <p>計測履歴なし</p>}
        </article>
      </section>
      <section className={styles.metrics} aria-label="流入と対応状況">
        <div><h2>主要流入語句</h2>{summary.topQuery ? <><p>{summary.topQuery.query}</p><small>{summary.topQuery.month} / 表示 {summary.topQuery.impressionCount}回</small></> : <p>流入語句データなし</p>}</div>
        <div><h2>退塾防止アラート</h2><p>未対応 {summary.churn.openCount}件 / 対応中 {summary.churn.inProgressCount}件</p><small>未解決の高リスク {summary.churn.highRiskCount}件</small></div>
      </section>
      <section className={styles.alert}>
        <div><h2>未返信口コミ</h2><p>{summary.pendingCount ? `未返信の口コミが${summary.pendingCount}件あります。` : "未返信の口コミはありません。"}</p></div>
        <Link href={href("/dashboard/reviews")}>口コミを確認</Link>
      </section>
      <section className={styles.actions}><h2>優先アクション</h2><ul>{summary.actions.length ? summary.actions.map(action => <li key={action.path + action.text}><Link href={href(action.path)}>{action.text}</Link></li>) : <li>現在、優先対応が必要なタスクはありません。</li>}</ul></section>
    </> : null}
  </main>;
}
