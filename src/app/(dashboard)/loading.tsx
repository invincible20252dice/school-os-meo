import styles from "./loading.module.css";

export default function DashboardLoading() {
  return (
    <main className={styles.page} aria-busy="true">
      <section className={styles.panel}>
        <span className={styles.spinner} aria-hidden="true" />
        <div>
          <p className={styles.kicker}>Loading</p>
          <h1>画面を読み込み中...</h1>
          <p>連携データと設定情報を確認しています。</p>
        </div>
      </section>
    </main>
  );
}
