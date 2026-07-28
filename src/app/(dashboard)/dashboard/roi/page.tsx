import { buildDifferentiationData } from "@/lib/mock/differentiationData";
import styles from "./page.module.css";

function RoiIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 19h16" />
      <path d="M6 15l4-4 3 3 5-7" />
      <path d="M15 7h3v3" />
    </svg>
  );
}

export default function RoiDashboardPage() {
  const data = buildDifferentiationData();
  const maxConversions = Math.max(
    ...data.roi?.channels?.map((channel) => channel?.conversions ?? 0),
    1,
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Student Acquisition ROI</p>
        <h1>成果可視化ダッシュボード</h1>
        <p>GBP、LINE、Instagramが体験申込と入塾貢献にどれだけつながったかを確認します。</p>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <RoiIcon />
          <span>今月の推定体験申込数</span>
          <strong>{data.roi?.trialApplications ?? 0}件</strong>
        </article>
        <article>
          <RoiIcon />
          <span>推定入塾貢献額</span>
          <strong>{(data.roi?.estimatedEnrollmentContributionYen ?? 0).toLocaleString("ja-JP")}円</strong>
        </article>
        <article className={styles.roiCard}>
          <RoiIcon />
          <span>月次ROI証明</span>
          <strong>{data.roi?.roiPercent ?? 0}%</strong>
          <p>ツール利用料 {(data.roi?.monthlyFeeYen ?? 0).toLocaleString("ja-JP")}円に対する費用対効果</p>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <RoiIcon />
          <div>
            <h2>流入経路比較</h2>
            <p>体験申込につながったチャネル別コンバージョンです。</p>
          </div>
        </div>
        <div className={styles.channelChart}>
          {data.roi?.channels?.map((channel) => (
            <div key={channel?.id} className={styles.channelRow}>
              <span>{channel?.label}</span>
              <div>
                <b
                  style={{
                    width: `${((channel?.conversions ?? 0) / maxConversions) * 100}%`,
                    background: channel?.color,
                  }}
                />
              </div>
              <strong>{channel?.conversions ?? 0}件</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
