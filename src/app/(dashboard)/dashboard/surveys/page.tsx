import styles from "./page.module.css";
import SurveysListClient from "./surveys-list-client";

export default function SurveysPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Surveys</p>
        <h1>アンケート設定一覧</h1>
        <p>口コミ生成に使うアンケートと設問を管理します。</p>
      </header>

      <SurveysListClient />
    </main>
  );
}
