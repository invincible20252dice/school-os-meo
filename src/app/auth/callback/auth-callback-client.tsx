"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { exchangeMagicLinkCode } from "@/lib/supabase-auth";
import styles from "./page.module.css";

function StatusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M4.2 6.8l2.8 2.8" />
      <path d="M17 14.4l2.8 2.8" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="M4.2 17.2l2.8-2.8" />
      <path d="M17 9.6l2.8-2.8" />
    </svg>
  );
}

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function exchangeCode() {
      try {
        const code = searchParams.get("code");
        await exchangeMagicLinkCode(code, createBrowserSupabaseClient());

        if (isActive) {
          router.replace("/dashboard");
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "認証に失敗しました。ログイン画面から再度お試しください。",
          );
        }
      }
    }

    exchangeCode();

    return () => {
      isActive = false;
    };
  }, [router, searchParams]);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <StatusIcon />
        <p className={styles.kicker}>
          {errorMessage ? "Authentication Error" : "Authenticating"}
        </p>
        <h1>{errorMessage ? "認証できませんでした。" : "認証情報を確認しています。"}</h1>
        <p>
          {errorMessage ||
            "確認が完了すると、ダッシュボードへ自動的に移動します。"}
        </p>
        {errorMessage ? (
          <Link href="/login" className={styles.linkButton}>
            ログイン画面へ戻る
          </Link>
        ) : null}
      </section>
    </main>
  );
}
