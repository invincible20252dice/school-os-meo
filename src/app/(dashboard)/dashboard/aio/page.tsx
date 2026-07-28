import {
  buildMockAioDashboardData,
  normalizeAioDashboardData,
  type AioDashboardData,
  type AioRadarAxis,
  type AioRecommendationStatus,
  type AioTrendPoint,
} from "@/lib/mock/aioData";
import styles from "./page.module.css";

function AioIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2" />
      <path d="M12 4v16" />
      <path d="M8 9h2" />
      <path d="M14 9h2" />
      <path d="M8 14h2" />
      <path d="M14 14h2" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 18h16" />
      <path d="M5 15l4-4 4 3 6-7" />
      <path d="M16 7h3v3" />
    </svg>
  );
}

function statusClass(status: AioRecommendationStatus) {
  if (status === "高推奨") {
    return `${styles.status} ${styles.statusHigh}`;
  }

  if (status === "未言及") {
    return `${styles.status} ${styles.statusMissing}`;
  }

  return styles.status;
}

function buildLinePoints(points: AioTrendPoint[]) {
  const width = 560;
  const height = 210;
  const padding = 22;
  const safePoints = points.length ? points : [{ date: "", score: 0 }];
  const max = Math.max(...safePoints.map((point) => point?.score ?? 0), 100);
  const min = Math.min(...safePoints.map((point) => point?.score ?? 0), 0);
  const range = Math.max(1, max - min);

  return safePoints
    .map((point, index) => {
      const x =
        padding +
        (index / Math.max(1, safePoints.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        (((point?.score ?? 0) - min) / range) * (height - padding * 2);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildRadarPoints(items: AioRadarAxis[], key: "ownSchool" | "competitor") {
  const center = 120;
  const radius = 88;
  const safeItems = items.length ? items : [{ axis: "", ownSchool: 0, competitor: 0 }];

  return safeItems
    .map((item, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / safeItems.length;
      const value = Math.max(0, Math.min(100, item?.[key] ?? 0));
      const pointRadius = (value / 100) * radius;
      const x = center + Math.cos(angle) * pointRadius;
      const y = center + Math.sin(angle) * pointRadius;

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function buildAxisPoints(items: AioRadarAxis[]) {
  const center = 120;
  const radius = 94;

  return items.map((item, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, items.length);

    return {
      label: item?.axis ?? "",
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });
}

function Metrics({ data }: { data: AioDashboardData }) {
  return (
    <section className={styles.metrics} aria-label="AIO主要指標">
      {data.metrics?.map((metric) => (
        <article className={styles.metricCard} key={metric?.label}>
          <span>{metric?.label ?? ""}</span>
          <strong>{metric?.value ?? ""}</strong>
          <p>{metric?.helper ?? ""}</p>
          <small>{metric?.trend ?? ""}</small>
        </article>
      ))}
    </section>
  );
}

export default function AioDashboardPage() {
  const data = normalizeAioDashboardData(buildMockAioDashboardData());
  const trendPoints = buildLinePoints(data.trend ?? []);
  const ownRadarPoints = buildRadarPoints(data.radar ?? [], "ownSchool");
  const competitorRadarPoints = buildRadarPoints(data.radar ?? [], "competitor");
  const axisPoints = buildAxisPoints(data.radar ?? []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>AIO Analytics</p>
        <h1>AIOスコア分析</h1>
        <p>{data.subtitle}</p>
      </header>

      <Metrics data={data} />

      <section className={styles.chartGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <TrendIcon />
            <div>
              <h2>スコア推移グラフ</h2>
              <p>{data.schoolName} の過去30日間のAIOスコア推移</p>
            </div>
          </div>
          <div className={styles.lineChart}>
            <svg viewBox="0 0 560 210" role="img" aria-label="AIOスコア推移">
              <path d="M22 188H538" />
              <path d="M22 22V188" />
              <polyline points={trendPoints} />
              {(data.trend ?? []).map((point, index) => (
                <circle
                  key={`${point?.date}-${index}`}
                  cx={trendPoints.split(" ")[index]?.split(",")[0] ?? 0}
                  cy={trendPoints.split(" ")[index]?.split(",")[1] ?? 0}
                  r="4"
                />
              ))}
            </svg>
            <div className={styles.trendLabels}>
              {(data.trend ?? []).map((point) => (
                <span key={point?.date}>{point?.date ?? ""}</span>
              ))}
            </div>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <AioIcon />
            <div>
              <h2>競合比較レーダーチャート</h2>
              <p>自校と競合塾のAI評価軸を比較</p>
            </div>
          </div>
          <div className={styles.radarChart}>
            <svg viewBox="0 0 240 240" role="img" aria-label="AIO競合比較">
              <circle cx="120" cy="120" r="88" />
              <circle cx="120" cy="120" r="58" />
              <circle cx="120" cy="120" r="29" />
              {axisPoints.map((axis) => (
                <g key={axis.label}>
                  <path d={`M120 120L${axis.x.toFixed(1)} ${axis.y.toFixed(1)}`} />
                  <text x={axis.x} y={axis.y}>{axis.label}</text>
                </g>
              ))}
              <polygon className={styles.competitorRadar} points={competitorRadarPoints} />
              <polygon className={styles.ownRadar} points={ownRadarPoints} />
            </svg>
            <div className={styles.legend}>
              <span><i className={styles.ownLegend} />自校</span>
              <span><i className={styles.competitorLegend} />競合平均</span>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <AioIcon />
          <div>
            <h2>AI言及分析テーブル</h2>
            <p>検索クエリごとのAI出力結果と改善アクション</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>検索クエリ</th>
                <th>ChatGPT</th>
                <th>Perplexity</th>
                <th>Gemini</th>
                <th>推奨</th>
                <th>改善アクション</th>
              </tr>
            </thead>
            <tbody>
              {(data.mentions ?? []).map((row) => (
                <tr key={row?.query}>
                  <td>{row?.query ?? ""}</td>
                  <td>{row?.chatgptSummary ?? ""}</td>
                  <td>{row?.perplexitySummary ?? ""}</td>
                  <td>{row?.geminiSummary ?? ""}</td>
                  <td>
                    <span className={statusClass(row?.status ?? "普通")}>
                      {row?.status ?? "普通"}
                    </span>
                  </td>
                  <td>{row?.action ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
