import Link from "next/link";
import {
  buildOwnerDashboardSummary,
  normalizeOwnerDashboardSummary,
} from "@/lib/dashboard-summary";
import styles from "./page.module.css";

function CardIcon({ type }: { type: "review" | "rank" | "aio" | "alert" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      {type === "review" ? (
        <>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.2A8 8 0 1 1 21 12z" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </>
      ) : null}
      {type === "rank" ? (
        <>
          <path d="M4 18h16" />
          <path d="M6 15l4-4 3 3 5-7" />
          <path d="M15 7h3v3" />
        </>
      ) : null}
      {type === "aio" ? (
        <>
          <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2" />
          <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2" />
          <path d="M12 4v16" />
        </>
      ) : null}
      {type === "alert" ? (
        <>
          <path d="M12 3l9 16H3L12 3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.1" />
        </>
      ) : null}
    </svg>
  );
}

export default function DashboardHomePage() {
  const summary = normalizeOwnerDashboardSummary(buildOwnerDashboardSummary());

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.kicker}>Owner Dashboard</p>
        <h1>店舗運用ダッシュボード</h1>
        <p>
          {summary.schoolName} の口コミ、MEO順位、AIOスコア、今週の優先アクションを一元管理します。
        </p>
      </header>

      <section className={styles.cardGrid}>
        <article className={styles.card}>
          <CardIcon type="review" />
          <span>今月の口コミ</span>
          <strong>{summary.review.monthlyCount}件</strong>
          <p>
            平均評価 {summary.review.averageRating} {summary.review.stars}
          </p>
          <small>{summary.review.changeLabel}</small>
        </article>
        <article className={styles.card}>
          <CardIcon type="rank" />
          <span>主要MEO順位</span>
          <strong>{summary.ranking.rank}位</strong>
          <p>{summary.ranking.keyword}</p>
          <small>前日比 {summary.ranking.changeLabel}</small>
        </article>
        <article className={styles.card}>
          <CardIcon type="aio" />
          <span>AIO平均表示スコア</span>
          <strong>{summary.aio.averageScore}%</strong>
          <p>
            ChatGPT {summary.aio.chatgptScore}% / Gemini{" "}
            {summary.aio.geminiScore}%
          </p>
          <small>Google AI {summary.aio.googleAiScore}%</small>
        </article>
      </section>

      <section className={styles.alert}>
        <CardIcon type="alert" />
        <div>
          <h2>未返信口コミアラート</h2>
          <p>
            未返信の口コミが {summary.unrepliedReviews.count}
            件あります。AI返信案を確認して、早めに対応してください。
          </p>
        </div>
        <Link href={summary.unrepliedReviews.href}>口コミを確認</Link>
      </section>

      <section className={styles.actions}>
        <div>
          <h2>AI今週のアクションプラン</h2>
          <p>優先度の高い運用タスクです。</p>
        </div>
        <ul>
          {summary.actions.length ? (
            summary.actions.map((action) => <li key={action}>{action}</li>)
          ) : (
            <li>現在、優先対応が必要なタスクはありません。</li>
          )}
        </ul>
      </section>
    </main>
  );
}
