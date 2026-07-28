import type { ReactNode } from "react";
import Link from "next/link";
import AuthAccessBadge from "@/components/dashboard/AuthAccessBadge";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  buildDemoDashboardAccessContext,
  getDashboardSettingsPath,
  getDemoLogoutPath,
} from "@/lib/auth-access";
import styles from "./layout.module.css";

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

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const access = buildDemoDashboardAccessContext();
  const userName = access.user.name || "ユーザー未設定";
  const userRole = access.user.role || "owner";
  const userInitial = userName.slice(0, 1).toUpperCase() || "S";

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.content}>
        <header className={styles.header}>
          {access.canSwitchSchool ? (
            <label className={styles.schoolSelect}>
              <span>選択校舎</span>
              <select defaultValue={access.currentSchoolId}>
                <option value="all">全校舎サマリー</option>
                {access.schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className={styles.schoolBadge}>
              <span>固定校舎</span>
              <strong>{access.currentSchoolName}</strong>
            </div>
          )}
          <div className={styles.headerRight}>
            <AuthAccessBadge />
            <nav className={styles.headerActions} aria-label="アカウント操作">
              <Link href={getDashboardSettingsPath()} className={styles.actionLink}>
                <HeaderIcon type="settings" />
                <span>設定</span>
              </Link>
              <Link href={getDemoLogoutPath()} className={styles.logoutLink}>
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
        {children}
      </div>
    </div>
  );
}
