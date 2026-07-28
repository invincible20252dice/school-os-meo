"use client";

import Link from "next/link";
import { useEffect } from "react";
import styles from "./error.module.css";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render error", error);
  }, [error]);

  return (
    <main className={styles.page}>
      <section className={styles.panel} role="alert">
        <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
          <path d="M12 3l9 16H3L12 3z" />
          <path d="M12 9v4" />
          <path d="M12 17h.1" />
        </svg>
        <p className={styles.kicker}>Render Error</p>
        <h1>画面の読み込みに失敗しました</h1>
        <p>
          連携データの取得中に問題が発生しました。再読み込みしても直らない場合は、設定画面で連携状態を確認してください。
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>
            再読み込み
          </button>
          <Link href="/dashboard/settings/instagram">Instagram設定へ</Link>
        </div>
      </section>
    </main>
  );
}
