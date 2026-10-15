"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getLogoutPhase, getServerLogoutPhase, startLocalLogout, subscribeLogout } from "@/lib/logout-operation";
import styles from "@/app/(dashboard)/layout.module.css";
import { createBrowserSupabaseClient } from "@/lib/supabase";

/** Browser rendering boundary only; API authorization remains server-side. */
export default function AuthApprovalGate({ children }: { children: ReactNode }) {
  const logoutPhase = useSyncExternalStore(subscribeLogout, getLogoutPhase, getServerLogoutPhase);
  const pathname = usePathname();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const hide = () => {
      if (container.current) container.current.hidden = false;
      setAllowed(false);
    };
    async function verifyApproval() {
      const current = ++generation;
      if (getLogoutPhase() !== "idle") return;
      try {
        const { data, error } = await createBrowserSupabaseClient().auth.getSession();
        if (!active || current !== generation || getLogoutPhase() !== "idle") return;
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) { hide(); router.replace("/login"); return; }
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
        });
        const result = (await response.json()) as { approved?: boolean };
        if (!active || current !== generation || getLogoutPhase() !== "idle") return;
        if (!response.ok) throw new Error("Approval unavailable");
        if (result.approved === false) { hide(); router.replace("/pending"); return; }
        if (result.approved !== true) throw new Error("Approval unavailable");
        setFailed(false);
        setAllowed(true);
        if (container.current) container.current.hidden = false;
      } catch {
        if (active && current === generation && getLogoutPhase() === "idle") { hide(); setFailed(true); }
      }
    }
    const pagehide = () => {
      ++generation; hide();
      // Hide synchronously before a browser history snapshot is captured.
      if (container.current) container.current.hidden = true;
    };
    const pageshow = () => {
      if (getLogoutPhase() === "complete") { window.location.replace("/login"); return; }
      if (container.current) container.current.hidden = false;
      void verifyApproval();
    };
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = createBrowserSupabaseClient().auth.onAuthStateChange((event) => {
        if (active && event === "SIGNED_OUT") {
          ++generation;
          hide();
          // Explicit logout owns navigation after SDK success.
          if (getLogoutPhase() === "idle") router.replace("/login");
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { /* Session verification below shows a retryable failure. */ }
    void verifyApproval();
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    return () => {
      active = false;
      ++generation;
      unsubscribe?.();
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
    };
  }, [pathname, router, retry]);

  return <div ref={container}>
    {logoutPhase !== "idle" ? <section className={styles.logoutPanel} aria-label="ログアウト処理">
      {logoutPhase === "failed" ? <>
        <p role="alert">ログアウトできませんでした。再度お試しください。</p>
        <p>認証情報が端末から削除されている場合があります。安全のため校舎データを非表示にしています。</p>
        <button type="button" onClick={() => { void startLocalLogout(); }}>ログアウトを再試行</button>
      </> : <p role="status">ログアウト中です。</p>}
    </section> : allowed ? children : failed ? <div role="alert">
      認証状態を確認できませんでした。
      <button type="button" onClick={() => { setFailed(false); setRetry(value => value + 1); }}>再度確認</button>
    </div> : null}
  </div>;
}
