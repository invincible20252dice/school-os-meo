"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AuthAccessBadge from "@/components/dashboard/AuthAccessBadge";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "@/app/(dashboard)/layout.module.css";

type DashboardContextResponse = {
  message?: string;
  user?: {
    name: string;
    role: string;
  };
  schools?: Array<{
    id: string;
    name: string;
  }>;
  currentSchoolId?: string;
  currentSchoolName?: string;
  canSwitchSchool?: boolean;
};

function HeaderIcon({ type }: { type: "settings" | "logout" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.actionIcon}>
      {type === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2 3-.2-.1a1.8 1.8 0 0 0-1.9-.1l-.5.2a1.7 1.7 0 0 0-1 1.4V22h-4v-.3a1.7 1.7 0 0 0-1-1.4l-.5-.2a1.8 1.8 0 0 0-1.9.1l-.2.1-2-3 .1-.1A1.6 1.6 0 0 0 4.6 15l-.2-.5a1.8 1.8 0 0 0-1.4-1H3v-3h.3a1.8 1.8 0 0 0 1.4-1l.2-.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1 2-3 .2.1a1.8 1.8 0 0 0 1.9.1l.5-.2a1.7 1.7 0 0 0 1-1.4V2h4v.3a1.7 1.7 0 0 0 1 1.4l.5.2a1.8 1.8 0 0 0 1.9-.1l.2-.1 2 3-.1.1a1.6 1.6 0 0 0-.3 1.8l.2.5a1.8 1.8 0 0 0 1.4 1h.3v3h-.3a1.8 1.8 0 0 0-1.4 1l-.1.5z" />
        </>
      ) : (
        <>
          <path d="M10 17l5-5-5-5" />
          <path d="M15 12H3" />
          <path d="M21 4v16" />
        </>
      )}
    </svg>
  );
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    const token = data.session?.access_token;

    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function withSchoolId(pathname: string, params: URLSearchParams, schoolId: string) {
  const nextParams = new URLSearchParams(params);
  nextParams.set("schoolId", schoolId);
  return `${pathname}?${nextParams.toString()}`;
}

export default function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [context, setContext] = useState<DashboardContextResponse>({
    schools: [],
    currentSchoolId: "",
    currentSchoolName: "校舎情報を取得中",
    canSwitchSchool: false,
    user: {
      name: "ユーザー",
      role: "manager",
    },
  });

  useEffect(() => {
    let ignore = false;

    async function loadContext() {
      const headers = await buildAuthHeaders();
      const schoolId = searchParams.get("schoolId") || "";
      const response = await fetch(
        `/api/dashboard/context${
          schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : ""
        }`,
        { headers },
      );
      const data = (await response.json()) as DashboardContextResponse;

      if (!ignore && response.ok) {
        setContext(data);

        if (!schoolId && data.currentSchoolId) {
          router.replace(
            withSchoolId(pathname, searchParams, data.currentSchoolId),
          );
        }
      }
    }

    void loadContext();

    return () => {
      ignore = true;
    };
  }, [pathname, router, searchParams]);

  const userName = context.user?.name || "ユーザー未設定";
  const userRole = context.user?.role || "manager";
  const userInitial = userName.slice(0, 1).toUpperCase() || "S";
  const currentSchoolId = context.currentSchoolId || "";
  const schools = context.schools || [];

  return (
    <header className={styles.header}>
      {context.canSwitchSchool ? (
        <label className={styles.schoolSelect}>
          <span>選択校舎</span>
          <select
            value={currentSchoolId}
            onChange={(event) => {
              router.push(withSchoolId(pathname, searchParams, event.target.value));
            }}
            disabled={!schools.length}
          >
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className={styles.schoolBadge}>
          <span>固定校舎</span>
          <strong>{context.currentSchoolName || "校舎未設定"}</strong>
        </div>
      )}
      <div className={styles.headerRight}>
        <AuthAccessBadge />
        <nav className={styles.headerActions} aria-label="アカウント操作">
          <Link
            href={withSchoolId("/dashboard/settings", searchParams, currentSchoolId)}
            className={styles.actionLink}
          >
            <HeaderIcon type="settings" />
            <span>設定</span>
          </Link>
          <Link href="/login" className={styles.logoutLink}>
            <HeaderIcon type="logout" />
            <span>ログアウト</span>
          </Link>
        </nav>
        <div className={styles.user}>
          <div>
            <strong>{userName}</strong>
            <span>{userRole}</span>
          </div>
          <b aria-hidden="true">{userInitial}</b>
        </div>
      </div>
    </header>
  );
}
