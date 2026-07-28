import {
  buildMeoExtendedData,
  getQueryCloudScale,
} from "@/lib/mock/meoExtendedData";
import styles from "./page.module.css";

function QueryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export default function QueryAnalyticsPage() {
  const data = buildMeoExtendedData();
  const cloud = getQueryCloudScale(data.queryCloud);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>GBP Queries</p>
        <h1>流入語句分析＆ワードクラウド</h1>
        <p>Googleビジネスプロフィールの検索表示につながった語句を可視化します。</p>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.panelTitle}>
          <QueryIcon />
          <div>
            <h2>検索クエリ分析</h2>
            <p>タグサイズは検索数に応じて変わります。</p>
          </div>
        </div>
        <button type="button">CSVエクスポート</button>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <h2>ワードクラウド</h2>
          <div className={styles.cloud}>
            {cloud?.map((query) => (
              <span key={query?.query} className={styles[`weight${query?.weight ?? 1}`]}>
                {query?.query}
              </span>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <h2>検索数ランキング</h2>
          <ol className={styles.ranking}>
            {data.queryCloud?.map((query) => (
              <li key={query?.query}>
                <div>
                  <strong>{query?.query ?? "-"}</strong>
                  <span>{query?.intent ?? "-"}</span>
                </div>
                <b>{query?.count?.toLocaleString("ja-JP") ?? 0}</b>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
