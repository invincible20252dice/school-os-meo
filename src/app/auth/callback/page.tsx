import { Suspense } from "react";
import { AuthCallbackClient } from "./auth-callback-client";
import styles from "./page.module.css";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <section className={styles.panel}>
            <p className={styles.kicker}>Authenticating</p>
            <h1>認証情報を確認しています。</h1>
          </section>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
