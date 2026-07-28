import {
  buildReviewAnalyticsData,
  normalizeReviewAnalyticsData,
  type ReviewOpinion,
  type ReviewSentiment,
} from "@/lib/mock/reviewAnalyticsData";
import styles from "./page.module.css";

const chartColors = [
  "#147d68",
  "#2c8fb8",
  "#d99a22",
  "#7457c5",
  "#27b58c",
  "#b84d3e",
  "#66737d",
  "#a85f2a",
];

function AnalyticsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-3" />
      <path d="M19 5l-5 5-3-2-4 4" />
    </svg>
  );
}

function sentimentLabel(sentiment: ReviewSentiment) {
  if (sentiment === "positive") {
    return "ポジティブ";
  }

  if (sentiment === "negative") {
    return "ネガティブ";
  }

  return "中立";
}

function sentimentClass(sentiment: ReviewSentiment) {
  if (sentiment === "positive") {
    return `${styles.sentimentBadge} ${styles.positiveBadge}`;
  }

  if (sentiment === "negative") {
    return `${styles.sentimentBadge} ${styles.negativeBadge}`;
  }

  return `${styles.sentimentBadge} ${styles.neutralBadge}`;
}

function DonutChart({ opinions }: { opinions: ReviewOpinion[] }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (opinions.length === 0) {
    return (
      <svg viewBox="0 0 120 120" role="img" aria-label="意見分布データなし" className={styles.chart}>
        <circle cx="60" cy="60" r={radius} className={styles.emptyRing} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="意見分布ドーナツチャート" className={styles.chart}>
      <circle cx="60" cy="60" r={radius} className={styles.chartBase} />
      {opinions.map((opinion, index) => {
        const dash = (opinion.percentage / 100) * circumference;
        const segment = (
          <circle
            key={opinion.id}
            cx="60"
            cy="60"
            r={radius}
            className={styles.chartSegment}
            stroke={chartColors[index % chartColors.length]}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
          />
        );

        offset += dash;
        return segment;
      })}
    </svg>
  );
}

export default function ReviewAnalyticsPage() {
  const analytics = normalizeReviewAnalyticsData(buildReviewAnalyticsData());

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Review AI Analytics</p>
          <h1>口コミAI分析</h1>
          <p>口コミ本文から抽出した感情と話題カテゴリを、学習塾向けに整理して確認できます。</p>
        </div>
        <div className={styles.headerBadge}>
          <AnalyticsIcon />
          <span>AI抽出意見 {analytics.sentiment.total}件</span>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="口コミ分析フィルター">
        {analytics.tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={tab.key === "all" ? `${styles.tab} ${styles.activeTab}` : styles.tab}
          >
            <span>{tab.label}</span>
            <b>{tab.count}</b>
          </button>
        ))}
      </nav>

      <section className={styles.sentimentPanel} aria-labelledby="sentiment-title">
        <div className={styles.panelTitle}>
          <h2 id="sentiment-title">感情分析</h2>
          <p>抽出された意見の総数: {analytics.sentiment.total}件</p>
        </div>
        <div className={styles.sentimentBar} aria-label="感情比率">
          <span
            className={styles.positiveSegment}
            style={{ width: `${analytics.sentiment.positivePercentage}%` }}
          />
          <span
            className={styles.neutralSegment}
            style={{ width: `${analytics.sentiment.neutralPercentage}%` }}
          />
          <span
            className={styles.negativeSegment}
            style={{ width: `${analytics.sentiment.negativePercentage}%` }}
          />
        </div>
        <div className={styles.sentimentLegend}>
          <span>ポジティブ {analytics.sentiment.positivePercentage}%</span>
          <span>中立 {analytics.sentiment.neutralPercentage}%</span>
          <span>ネガティブ {analytics.sentiment.negativePercentage}%</span>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <h2>Opinion Distribution</h2>
            <p>話題ごとの割合</p>
          </div>
          <div className={styles.chartWrap}>
            <DonutChart opinions={analytics.opinions} />
            <div className={styles.chartCenter}>
              <strong>{analytics.opinions.length}</strong>
              <span>カテゴリ</span>
            </div>
          </div>
          <ul className={styles.legendList}>
            {analytics.opinions.map((opinion, index) => (
              <li key={opinion.id}>
                <span
                  className={styles.legendSwatch}
                  style={{ background: chartColors[index % chartColors.length] }}
                />
                <div>
                  <strong>{opinion.category}</strong>
                  <small>{opinion.percentage}%</small>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <h2>Opinion Details</h2>
            <p>AIが抽出した主な意見</p>
          </div>
          <div className={styles.opinionList}>
            {analytics.opinions.length > 0 ? (
              analytics.opinions.map((opinion) => (
                <div className={styles.opinionItem} key={opinion.id}>
                  <div>
                    <strong>{opinion.label}</strong>
                    <p>
                      {opinion.category} / {opinion.count}件 / {opinion.percentage}%
                    </p>
                  </div>
                  <span className={sentimentClass(opinion.sentiment)}>
                    {sentimentLabel(opinion.sentiment)}
                  </span>
                </div>
              ))
            ) : (
              <p className={styles.emptyState}>分析対象の口コミデータはまだありません。</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
