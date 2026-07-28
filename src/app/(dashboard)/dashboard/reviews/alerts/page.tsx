import {
  buildDifferentiationData,
  getRetentionAlertCounts,
  type RetentionAlertStatus,
} from "@/lib/mock/differentiationData";
import styles from "./page.module.css";

function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 3l9 16H3L12 3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.1" />
    </svg>
  );
}

function statusClass(status: RetentionAlertStatus) {
  if (status === "完了") {
    return `${styles.status} ${styles.done}`;
  }

  if (status === "対応中") {
    return `${styles.status} ${styles.progress}`;
  }

  return `${styles.status} ${styles.todo}`;
}

export default function RetentionAlertsPage() {
  const data = buildDifferentiationData();
  const counts = getRetentionAlertCounts(data.retentionAlerts);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Silent Guardian Alerts</p>
        <h1>サイレント保護者検知・退塾防止アラート</h1>
        <p>低評価アンケートを外部口コミ化する前に、内部対応として管理します。</p>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <AlertIcon />
          <span>改善要請</span>
          <strong>{counts.total}件</strong>
        </article>
        <article>
          <AlertIcon />
          <span>未完了</span>
          <strong>{counts.unresolved}件</strong>
        </article>
        <article>
          <AlertIcon />
          <span>★1〜2</span>
          <strong>{counts.critical}件</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <AlertIcon />
          <div>
            <h2>改善要請一覧</h2>
            <p>評価点、保護者属性、不満カテゴリ、AI対応策を確認します。</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>評価</th>
                <th>保護者属性</th>
                <th>不満カテゴリ</th>
                <th>回答日時</th>
                <th>ステータス</th>
                <th>AI対応策アドバイス</th>
              </tr>
            </thead>
            <tbody>
              {data.retentionAlerts?.map((alert) => (
                <tr key={alert?.id}>
                  <td>★{alert?.rating}</td>
                  <td>{alert?.guardianSegment}</td>
                  <td>{alert?.category}</td>
                  <td>{alert?.answeredAt}</td>
                  <td>
                    <span className={statusClass(alert?.status ?? "未対応")}>
                      {alert?.status}
                    </span>
                  </td>
                  <td>{alert?.aiAdvice}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
