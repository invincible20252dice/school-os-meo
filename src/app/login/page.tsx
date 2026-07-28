"use client";

import { useState } from "react";
import { buildLoginProviders } from "@/lib/auth-access";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { startGoogleOAuth } from "@/lib/supabase-auth";
import styles from "./page.module.css";

function BrandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className={styles.brandIcon}>
      <rect x="6" y="8" width="36" height="32" rx="8" />
      <path d="M16 30l6-6 5 4 7-10" />
      <path d="M15 17h8" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.providerIcon}>
      <path d="M21 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7.1z" />
      <path d="M12 21c2.6 0 4.8-.9 6.3-2.4l-3.1-2.4c-.9.6-2 .9-3.2.9-2.5 0-4.6-1.7-5.4-3.9H3.4v2.5A9.5 9.5 0 0 0 12 21z" />
      <path d="M6.6 13.2a5.7 5.7 0 0 1 0-3.6V7.1H3.4a9.5 9.5 0 0 0 0 8.6l3.2-2.5z" />
      <path d="M12 5.7c1.4 0 2.7.5 3.7 1.4l2.7-2.7A9 9 0 0 0 12 2 9.5 9.5 0 0 0 3.4 7.1l3.2 2.5c.8-2.2 2.9-3.9 5.4-3.9z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.arrowIcon}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

export default function LoginPage() {
  const providers = buildLoginProviders();
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleGoogleLogin() {
    setIsSending(true);
    setMessage("");

    try {
      await startGoogleOAuth(
        createBrowserSupabaseClient(),
        window.location.origin,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Googleログインを開始できませんでした。",
      );
      setIsSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-label="ログイン">
        <div className={styles.brand}>
          <BrandIcon />
          <div>
            <span>MEO AIO</span>
            <strong>School OS</strong>
          </div>
        </div>
        <div className={styles.copy}>
          <p className={styles.kicker}>Secure Access</p>
          <h1>校舎データに入る前に認証します。</h1>
          <p>
            本部は全校舎、教室長は割り当て校舎だけを扱えるように、
            Googleログイン後にアクセス権限を判定します。
          </p>
        </div>
      </section>

      <section className={styles.panel} aria-label="ログイン方法">
        <div className={styles.logoWrap}>
          <img
            src="/service-logo.png"
            alt="塾MEO 学習塾に特化したMEO対策ツール"
            className={styles.serviceLogo}
          />
        </div>

        <div className={styles.panelHeader}>
          <p className={styles.kicker}>Login</p>
          <h2>ログイン</h2>
        </div>

        <div className={styles.providers}>
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              className={styles.providerButton}
              onClick={handleGoogleLogin}
              disabled={isSending}
            >
              <GoogleIcon />
              <span>
                <strong>{isSending ? "Googleへ移動しています" : provider.label}</strong>
                <small>{provider.description}</small>
              </span>
              <ArrowIcon />
            </button>
          ))}
        </div>

        {message ? (
          <p className={`${styles.statusMessage} ${styles.errorMessage}`}>
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
