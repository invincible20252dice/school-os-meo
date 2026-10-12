"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { leaveDashboard, signOutCurrentSession } from "@/lib/logout";

const LogoutContext = createContext<() => void>(() => undefined);

export function LogoutButton({ children, className }: { children: ReactNode; className?: string }) {
  const logout = useContext(LogoutContext);
  return <button type="button" className={className} aria-label="ログアウト" onClick={logout}>{children}</button>;
}

export default function AuthApprovalGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [approvedPath, setApprovedPath] = useState<string | null>(null);
  const [mountedPath, setMountedPath] = useState<string | null>(null);
  const [failure, setFailure] = useState<"check" | "logout" | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [retry, setRetry] = useState(0);
  const content = useRef<HTMLDivElement>(null);
  const logout = useRef<() => void>(() => undefined);

  useEffect(() => {
    let active = true, generation = 0, logoutPending = false, logoutAttempted = false;
    const controller = new AbortController();
    const hide = (clearContent = true) => {
      generation++;
      // Synchronous DOM hiding also covers pages restored from the back/forward cache.
      if (content.current) content.current.hidden = true;
      setApprovedPath(null);
      if (clearContent) setMountedPath(null);
    };
    let client: ReturnType<typeof createBrowserSupabaseClient>;
    try { client = createBrowserSupabaseClient(); }
    catch { setFailure("check"); return; }

    async function verifyApproval() {
      if (logoutAttempted) return;
      // A focus check hides existing content without discarding unsaved drafts.
      hide(false); setFailure(null);
      const request = generation;
      const current = () => active && request === generation;
      try {
        const { data, error } = await client.auth.getSession();
        if (!current()) return;
        if (error) throw error;
        const token = data.session?.access_token;
        if (!token) { hide(); router.replace("/login"); return; }
        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const result = await response.json() as { authenticated?: boolean; approved?: boolean };
        if (!current()) return;
        if (response.status === 401 || result.authenticated === false) { hide(); router.replace("/login"); return; }
        if (!response.ok || result.authenticated !== true) throw new Error("Access check failed");
        if (result.approved === false) { hide(); router.replace("/pending"); return; }
        if (result.approved !== true) throw new Error("Approval missing");
        if (content.current) content.current.hidden = false;
        setApprovedPath(pathname);
        setMountedPath(pathname);
      } catch { if (current()) { hide(); setFailure("check"); } }
    }

    async function performLogout() {
      if (logoutPending) return;
      logoutPending = true; logoutAttempted = true; hide(); setFailure(null); setSigningOut(true);
      try {
        await signOutCurrentSession(client);
        if (active) leaveDashboard();
      } catch {
        // Some SDK failures clear local storage but cannot confirm server revocation.
        // Keep a visible failure and retry; never present that as a successful logout.
        if (active) setFailure("logout");
      } finally { logoutPending = false; if (active) setSigningOut(false); }
    }
    logout.current = () => { void performLogout(); };
    const { data: { subscription } } = client.auth.onAuthStateChange(event => {
      if (event !== "SIGNED_OUT" || !active) return;
      hide();
      if (!logoutAttempted) router.replace("/login");
    });
    const recheck = () => { void verifyApproval(); };
    const hidePage = () => hide();
    window.addEventListener("pageshow", recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pagehide", hidePage);
    recheck();
    return () => {
      active = false; generation++; controller.abort(); subscription.unsubscribe();
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pagehide", hidePage);
    };
  }, [pathname, router, retry]);

  return <LogoutContext.Provider value={() => logout.current()}>
    <div ref={content} hidden={approvedPath !== pathname}>
      {mountedPath === pathname ? children : null}
    </div>
    {failure ? <div role="alert">
      <p>{failure === "logout" ? "ログアウトを完了できませんでした。再試行してください。" : "ログイン状態を確認できませんでした。"}</p>
      <button type="button" onClick={() => failure === "logout" ? logout.current() : setRetry(value => value + 1)}>
        {failure === "logout" ? "ログアウトを再試行" : "再確認"}
      </button>
    </div> : approvedPath !== pathname ? <p role="status">{signingOut ? "ログアウトしています。" : "ログイン状態を確認しています。"}</p> : null}
  </LogoutContext.Provider>;
}
