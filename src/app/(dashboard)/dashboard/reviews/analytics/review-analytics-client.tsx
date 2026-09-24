"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { aggregateReviewAnalysis, isAnalyticsResponse, type AnalyticsLanguage, type AnalyticsResponse } from "@/lib/review-analytics";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./page.module.css";

const colors = ["#147d68", "#2c8fb8", "#7457c5", "#d99a22", "#27b58c", "#b84d3e", "#66737d", "#a85f2a"];
const languageLabels = { all: "全体", ja: "日本語", en: "英語", other: "その他" };
const sentimentLabels = { positive: "ポジティブ", neutral: "中立", negative: "ネガティブ" };
const failureMessage = "口コミ分析データを取得できませんでした。";
type State = { key: string; data: AnalyticsResponse | null; error: string | null };

function Donut({ categories }: { categories: ReturnType<typeof aggregateReviewAnalysis>["categories"] }) {
  let offset = 0;
  const circumference = 2 * Math.PI * 42;
  return <svg viewBox="0 0 120 120" role="img" aria-label={categories.length ? "意見分布ドーナツチャート" : "意見分布データなし"} className={styles.chart}>
    <circle cx="60" cy="60" r="42" className={styles.chartBase} />
    {categories.map((category, index) => {
      const dash = category.percentage / 100 * circumference;
      const segment = <circle key={category.name} cx="60" cy="60" r="42" className={styles.chartSegment} stroke={colors[index]} strokeDasharray={`${dash} ${circumference - dash}`} strokeDashoffset={-offset} />;
      offset += dash;
      return segment;
    })}
  </svg>;
}

export default function ReviewAnalyticsClient() {
  const params = useSearchParams();
  const schoolId = params.get("schoolId") || "";
  const [retry, setRetry] = useState(0);
  const [language, setLanguage] = useState<AnalyticsLanguage>("all");
  const [state, setState] = useState<State>({ key: "", data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ key: schoolId, data: null, error: null });
    setLanguage("all");
    async function load() {
      try {
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        if (controller.signal.aborted) return;
        if (!data.session?.access_token) throw new Error("ログイン後に口コミ分析を確認してください。");
        const response = await fetch(`/api/dashboard/reviews/analytics${schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""}`, {
          headers: { authorization: `Bearer ${data.session.access_token}` }, cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : failureMessage);
        if (!isAnalyticsResponse(body)) throw new Error(failureMessage);
        if (!controller.signal.aborted) setState({ key: schoolId, data: body, error: null });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key: schoolId, data: null, error: error instanceof Error ? error.message : failureMessage });
      }
    }
    void load();
    return () => controller.abort();
  }, [schoolId, retry]);
  const current = state.key === schoolId ? state : null;
  const data = current?.data;
  const analytics = data ? aggregateReviewAnalysis(data.analyses, language) : null;
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.kicker}>Review AI Analytics</p><h1>口コミAI分析</h1>{data ? <p>{data.schoolName} / Google口コミ {data.totalReviews}件</p> : null}</div>
      <button type="button" className={styles.tab} onClick={() => setRetry(value => value + 1)} disabled={!data && !current?.error}>再取得</button>
    </header>
    {current?.error ? <p role="alert" className={styles.error}>{current.error}</p> : !data ? <p role="status" className={styles.emptyState}>口コミ本文を分析しています。</p> : null}
    {data && analytics ? <>
      <p className={styles.scope}>対象: 最新{data.sampledReviews}件（上限{data.limit}件） / 本文あり {data.textReviews}件 / 本文なし {data.sampledReviews - data.textReviews}件</p>
      <nav className={styles.tabs} aria-label="口コミ分析フィルター">
        {analytics.tabs.map(tab => <button key={tab.key} type="button" aria-pressed={language === tab.key} className={`${styles.tab} ${language === tab.key ? styles.activeTab : ""}`} onClick={() => setLanguage(tab.key)}>{languageLabels[tab.key]} <b>{tab.count}</b></button>)}
      </nav>
      <section className={styles.sentimentPanel} aria-labelledby="sentiment-title">
        <div className={styles.panelTitle}><h2 id="sentiment-title">感情分析</h2><p>口コミ {analytics.reviewCount}件 / 抽出意見 {analytics.totalOpinions}件</p></div>
        <div className={styles.sentimentBar} aria-label="感情比率">
          <span className={styles.positiveSegment} style={{ width: `${analytics.sentiment.positive}%` }} />
          <span className={styles.neutralSegment} style={{ width: `${analytics.sentiment.neutral}%` }} />
          <span className={styles.negativeSegment} style={{ width: `${analytics.sentiment.negative}%` }} />
        </div>
        <div className={styles.sentimentLegend}>{(["positive", "neutral", "negative"] as const).map(key => <span key={key}>{sentimentLabels[key]} {analytics.sentiment[key]}%</span>)}</div>
      </section>
      <section className={styles.mainGrid}>
        <section className={styles.panel} aria-labelledby="distribution-title">
          <div className={styles.panelTitle}><h2 id="distribution-title">話題カテゴリ</h2><p>抽出意見に占める割合</p></div>
          <div className={styles.chartWrap}><Donut categories={analytics.categories} /><div className={styles.chartCenter}><strong>{analytics.categories.length}</strong><span>カテゴリ</span></div></div>
          <ul className={styles.legendList}>{analytics.categories.map((category, index) => <li key={category.name}><span className={styles.legendSwatch} style={{ background: colors[index] }} /><div><strong>{category.name}</strong><small>{category.count}件 / {category.percentage}%</small></div></li>)}</ul>
        </section>
        <section className={styles.panel} aria-labelledby="opinions-title">
          <div className={styles.panelTitle}><h2 id="opinions-title">抽出意見</h2><p>口コミ本文からの引用</p></div>
          <div className={styles.opinionList}>{analytics.opinions.length ? analytics.opinions.map(opinion => <article className={styles.opinionItem} key={`${opinion.reviewId}:${opinion.category}`}>
            <div><blockquote>{opinion.quote}</blockquote><p>{opinion.category}</p><Link href={`/dashboard/reviews?schoolId=${encodeURIComponent(data.schoolId ?? "all")}&reviewId=${encodeURIComponent(opinion.reviewId)}`}>元の口コミを確認</Link></div>
            <span className={`${styles.sentimentBadge} ${styles[`${opinion.sentiment}Badge`]}`}>{sentimentLabels[opinion.sentiment]}</span>
          </article>) : <p className={styles.emptyState}>{data.totalReviews === 0 ? "Google口コミはまだ登録されていません。" : "この条件で分析できる意見はありません。"}</p>}</div>
        </section>
      </section>
    </> : null}
  </main>;
}
