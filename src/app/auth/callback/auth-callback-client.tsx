"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { exchangeSupabaseAuthCallback } from "@/lib/supabase-auth";
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
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function exchangeCode() {
      try {
        await exchangeSupabaseAuthCallback(
          {
            search: window.location.search,
            hash: window.location.hash,
          },
          createBrowserSupabaseClient(),
        );
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        const token = data.session?.access_token;
        const accessResponse = token
          ? await fetch("/api/auth/me", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            })
          : null;
        const access = accessResponse?.ok
          ? ((await accessResponse.json()) as { approved?: boolean })
          : null;

        if (isActive) {
          router.replace(access?.approved === false ? "/pending" : "/dashboard");
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
  }, [router]);

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
