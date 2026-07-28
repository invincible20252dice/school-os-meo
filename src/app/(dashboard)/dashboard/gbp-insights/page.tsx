import styles from "./page.module.css";

const demoRows = [
  {
    schoolName: "青葉ゼミナール 本校",
    date: "2026-07-21",
    views: 1240,
    searches: 386,
    websiteClicks: 42,
    phoneCalls: 13,
    routeRequests: 28,
  },
  {
    schoolName: "青葉ゼミナール 駅前校",
    date: "2026-07-21",
    views: 980,
    searches: 244,
    websiteClicks: 31,
    phoneCalls: 8,
    routeRequests: 19,
  },
  {
    schoolName: "青葉ゼミナール 南口校",
    date: "2026-07-21",
    views: 760,
    searches: 201,
    websiteClicks: 24,
    phoneCalls: 6,
    routeRequests: 15,
  },
];

const totals = demoRows.reduce(
  (current, row) => ({
    views: current.views + row.views,
    searches: current.searches + row.searches,
    websiteClicks: current.websiteClicks + row.websiteClicks,
    phoneCalls: current.phoneCalls + row.phoneCalls,
    routeRequests: current.routeRequests + row.routeRequests,
  }),
  {
    views: 0,
    searches: 0,
    websiteClicks: 0,
    phoneCalls: 0,
    routeRequests: 0,
  },
);

function ChartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="11" width="3" height="5" rx="1" />
      <rect x="12" y="7" width="3" height="9" rx="1" />
      <rect x="17" y="9" width="3" height="7" rx="1" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 15v4h14v-4" />
    </svg>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ja-JP").format(value);
}

export default function GbpInsightsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>GBP Insights</p>
          <h1>GBPインサイト収集</h1>
          <p>
            Googleビジネスプロフィールの表示・検索・行動指標を日次で蓄積し、Looker
            Studio連携に使うデータを確認します。
          </p>
        </div>
        <div className={styles.statusCard}>
          <DatabaseIcon />
          <div>
            <span>保存先</span>
            <strong>Supabase PostgreSQL</strong>
          </div>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <ChartIcon />
          <span>表示回数</span>
          <strong>{formatNumber(totals.views)}</strong>
        </article>
        <article>
          <ChartIcon />
          <span>検索数</span>
          <strong>{formatNumber(totals.searches)}</strong>
        </article>
        <article>
          <ExportIcon />
          <span>サイトクリック</span>
          <strong>{formatNumber(totals.websiteClicks)}</strong>
        </article>
        <article>
          <ExportIcon />
          <span>電話・経路</span>
          <strong>{formatNumber(totals.phoneCalls + totals.routeRequests)}</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>日次データ</h2>
            <p>Looker Studio / BigQuery同期向けの行形式です。</p>
          </div>
          <code>/api/analytics/gbp-metrics</code>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>校舎</th>
                <th>表示</th>
                <th>検索</th>
                <th>サイト</th>
                <th>電話</th>
                <th>経路</th>
              </tr>
            </thead>
            <tbody>
              {demoRows.map((row) => (
                <tr key={`${row.schoolName}-${row.date}`}>
                  <td>{row.date}</td>
                  <td>{row.schoolName}</td>
                  <td>{formatNumber(row.views)}</td>
                  <td>{formatNumber(row.searches)}</td>
                  <td>{formatNumber(row.websiteClicks)}</td>
                  <td>{formatNumber(row.phoneCalls)}</td>
                  <td>{formatNumber(row.routeRequests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
