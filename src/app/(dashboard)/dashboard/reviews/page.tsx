import ReviewsClient from "./reviews-client";
import styles from "./page.module.css";

export default function ReviewsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Google Business Profile</p>
        <h1>口コミ一覧・返信</h1>
        <p>
          選択中の校舎に届いたGoogle口コミとAI返信案を確認し、Googleへ返信できます。
        </p>
      </header>

      <ReviewsClient />
    </main>
  );
}
