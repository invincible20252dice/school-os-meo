"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildLoginProviders,
  buildMagicLinkMessage,
  getDemoGoogleLoginPath,
} from "@/lib/auth-access";
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

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.providerIcon}>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M5 8l7 5 7-5" />
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
  const router = useRouter();
  const providers = buildLoginProviders();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleProviderClick(providerId: "google" | "email") {
    if (providerId === "google") {
      router.push(getDemoGoogleLoginPath());
      return;
    }

    emailInputRef.current?.focus();
    setMessage("メールアドレスを入力して、認証リンクを送信してください。");
  }

  function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(buildMagicLinkMessage(email));
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
            ログイン時点でアクセス権限を分けます。
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
              onClick={() => handleProviderClick(provider.id)}
            >
              {provider.id === "google" ? <GoogleIcon /> : <MailIcon />}
              <span>
                <strong>{provider.label}</strong>
                <small>{provider.description}</small>
              </span>
              <ArrowIcon />
            </button>
          ))}
        </div>

        <form className={styles.emailForm} onSubmit={handleEmailSubmit}>
          <label>
            <span>メールアドレス</span>
            <input
              ref={emailInputRef}
              type="email"
              placeholder="owner@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit">認証リンクを送信</button>
        </form>

        {message ? <p className={styles.statusMessage}>{message}</p> : null}

        <div className={styles.demoBox}>
          <span>デモ確認</span>
          <p>認証連携前のローカル確認として、権限分離済みのダッシュボードへ進めます。</p>
          <Link href="/dashboard">
            ダッシュボードを開く
            <ArrowIcon />
          </Link>
        </div>
      </section>
    </main>
  );
}
