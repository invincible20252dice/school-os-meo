import Link from "next/link";
import styles from "./page.module.css";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <p className={styles.kicker}>MEO x AIO School</p>
        <h1 className={styles.title}>
          学習塾向け口コミアシストのローカル開発環境
        </h1>
        <p className={styles.description}>
          認証画面から、本部・校舎オーナーの権限分離を前提にダッシュボードへ入ります。
        </p>
        <Link href="/login" className={styles.linkButton}>
          ログイン画面を開く
          <ArrowIcon />
        </Link>
      </div>
    </main>
  );
}
