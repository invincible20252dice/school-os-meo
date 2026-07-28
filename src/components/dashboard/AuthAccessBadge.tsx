"use client";

import { useEffect, useState } from "react";
import { resolveUserAccessFromSupabase } from "@/lib/access-control";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./AuthAccessBadge.module.css";

type AccessState = {
  label: string;
  role: string;
  schoolId: string;
  status: "loading" | "authenticated" | "anonymous" | "error";
};

export default function AuthAccessBadge() {
  const [access, setAccess] = useState<AccessState>({
    label: "認証確認中",
    role: "-",
    schoolId: "-",
    status: "loading",
  });

  useEffect(() => {
    let isActive = true;

    async function loadAccess() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: userResult, error: userError } = await supabase.auth.getUser();

        if (userError || !userResult.user) {
          if (isActive) {
            setAccess({
              label: "未ログイン",
              role: "-",
              schoolId: "-",
              status: "anonymous",
            });
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, role, school_id, school_ids, full_name")
          .eq("id", userResult.user.id)
          .maybeSingle();
        const resolvedAccess = resolveUserAccessFromSupabase(
          {
            id: userResult.user.id,
            email: userResult.user.email || "",
            user_metadata: userResult.user.user_metadata,
          },
          profile,
        );

        if (isActive) {
          setAccess({
            label: resolvedAccess.name,
            role: resolvedAccess.role,
            schoolId:
              resolvedAccess.role === "admin"
                ? "all"
                : resolvedAccess.schoolId || "未設定",
            status: "authenticated",
          });
        }
      } catch {
        if (isActive) {
          setAccess({
            label: "権限確認エラー",
            role: "-",
            schoolId: "-",
            status: "error",
          });
        }
      }
    }

    loadAccess();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className={`${styles.badge} ${styles[access.status]}`}>
      <span>Supabase権限</span>
      <strong>{access.label}</strong>
      <small>
        role: {access.role} / school: {access.schoolId}
      </small>
    </div>
  );
}
