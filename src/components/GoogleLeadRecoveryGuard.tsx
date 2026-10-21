"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { clearLeadRecovery, initializeLeadRecoveryDocument, LEAD_RECOVERY_CHANGED, LEAD_RECOVERY_ROUTE, nextLeadRecoveryExpiry, pruneLeadRecovery } from "@/lib/google-lead-recovery-storage";

/** Disposes only inquiry-recovery metadata. Existing authentication is unchanged. */
export default function GoogleLeadRecoveryGuard() {
  const pathname = usePathname();
  const schoolId = useSearchParams().get("schoolId") || "";
  useEffect(() => {
    initializeLeadRecoveryDocument();
    pruneLeadRecovery({ route: pathname, schoolId });
  }, [pathname, schoolId]);

  useEffect(() => {
    // Other routes need disposal only; do not initialize auth for public pages.
    if (pathname !== LEAD_RECOVERY_ROUTE) return;
    initializeLeadRecoveryDocument();
    let active = true;
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = createBrowserSupabaseClient().auth.onAuthStateChange((_event, session) => {
        if (!active) return;
        // No async Supabase call inside its auth-state callback.
        if (!session?.user.id) clearLeadRecovery();
        pruneLeadRecovery({ userId: session?.user.id.toLowerCase() || "" });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { clearLeadRecovery(); }
    let timer: number | undefined;
    const scheduleExpiry = () => {
      window.clearTimeout(timer);
      const deadline = nextLeadRecoveryExpiry();
      if (deadline !== null) timer = window.setTimeout(prune, Math.max(1, deadline - Date.now()));
    };
    const prune = () => { pruneLeadRecovery(); scheduleExpiry(); };
    const pageshow = (event: PageTransitionEvent) => {
      // A bfcache restoration is not the approved reload recovery boundary.
      if (event.persisted) clearLeadRecovery();
      prune();
    };
    scheduleExpiry();
    window.addEventListener(LEAD_RECOVERY_CHANGED, scheduleExpiry);
    window.addEventListener("pageshow", pageshow);
    document.addEventListener("visibilitychange", prune);
    return () => {
      active = false;
      unsubscribe?.();
      window.clearTimeout(timer);
      window.removeEventListener(LEAD_RECOVERY_CHANGED, scheduleExpiry);
      window.removeEventListener("pageshow", pageshow);
      document.removeEventListener("visibilitychange", prune);
    };
  }, [pathname]);
  return null;
}
