"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function AuthApprovalGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    async function verifyApproval() {
      try {
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        const token = data.session?.access_token;

        if (!token) {
          return;
        }

        const response = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = (await response.json()) as { approved?: boolean };

        if (isActive && result.approved === false && pathname !== "/pending") {
          router.replace("/pending");
        }
      } catch {
        return;
      }
    }

    void verifyApproval();

    return () => {
      isActive = false;
    };
  }, [pathname, router]);

  return null;
}
