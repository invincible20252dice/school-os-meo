import Link from "next/link";
import styles from "./page.module.css";

function PendingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export default function PendingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <PendingIcon />
        <p className={styles.kicker}>Approval Pending</p>
        <h1>現在本部にてアカウントの承認待ちです。</h1>
        <p>承認完了までお待ちください。承認後は同じログインURLから管理画面に入れます。</p>
        <Link href="/login">ログイン画面へ戻る</Link>
      </section>
    </main>
  );
}
