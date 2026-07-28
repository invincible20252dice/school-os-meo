"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { dashboardNavItems, type DashboardNavItem } from "./navigation";
import styles from "./Sidebar.module.css";

function NavIcon({ type }: { type: DashboardNavItem["icon"] }) {
  const common = <path d="M4 19h16" />;

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      {type === "dashboard" ? (
        <>
          <rect x="4" y="5" width="6" height="6" rx="1" />
          <rect x="14" y="5" width="6" height="6" rx="1" />
          <rect x="4" y="15" width="6" height="4" rx="1" />
          <rect x="14" y="15" width="6" height="4" rx="1" />
        </>
      ) : null}
      {type === "survey" ? (
        <>
          <path d="M7 4h10l2 2v14H5V6l2-2z" />
          <path d="M8 9h8" />
          <path d="M8 13h8" />
          <path d="M8 17h5" />
        </>
      ) : null}
      {type === "review" ? (
        <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.2A8 8 0 1 1 21 12z" />
      ) : null}
      {type === "ranking" ? (
        <>
          {common}
          <path d="M6 16l4-4 3 3 5-7" />
          <path d="M15 8h3v3" />
        </>
      ) : null}
      {type === "aio" ? (
        <>
          <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2" />
          <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2" />
          <path d="M12 4v16" />
        </>
      ) : null}
      {type === "instagram" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M17.5 6.8h.1" />
        </>
      ) : null}
      {type === "report" ? (
        <>
          <path d="M5 19V5" />
          {common}
          <rect x="8" y="12" width="2.8" height="4" rx="1" />
          <rect x="12.6" y="8" width="2.8" height="8" rx="1" />
          <rect x="17.2" y="10" width="2.8" height="6" rx="1" />
        </>
      ) : null}
      {type === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2 3-.2-.1a1.8 1.8 0 0 0-1.9-.1l-.5.2a1.7 1.7 0 0 0-1 1.4V22h-4v-.3a1.7 1.7 0 0 0-1-1.4l-.5-.2a1.8 1.8 0 0 0-1.9.1l-.2.1-2-3 .1-.1A1.6 1.6 0 0 0 4.6 15l-.2-.5a1.8 1.8 0 0 0-1.4-1H3v-3h.3a1.8 1.8 0 0 0 1.4-1l.2-.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1 2-3 .2.1a1.8 1.8 0 0 0 1.9.1l.5-.2a1.7 1.7 0 0 0 1-1.4V2h4v.3a1.7 1.7 0 0 0 1 1.4l.5.2a1.8 1.8 0 0 0 1.9-.1l.2-.1 2 3-.1.1a1.6 1.6 0 0 0-.3 1.8l.2.5a1.8 1.8 0 0 0 1.4 1h.3v3h-.3a1.8 1.8 0 0 0-1.4 1l-.1.5z" />
        </>
      ) : null}
    </svg>
  );
}

function isActive(pathname: string, item: DashboardNavItem) {
  if (item.href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/roi");
  }

  if (item.href === "/dashboard/rankings") {
    return pathname.startsWith("/dashboard/rank") || pathname.startsWith("/dashboard/keywords");
  }

  if (item.href === "/dashboard/report") {
    return pathname.startsWith("/dashboard/report") || pathname.startsWith("/dashboard/analytics");
  }

  if (item.href === "/dashboard/instagram") {
    return pathname.startsWith("/dashboard/instagram") || pathname.startsWith("/dashboard/posts");
  }

  if (item.href === "/dashboard/aio") {
    return pathname.startsWith("/dashboard/aio");
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.mobileToggle}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="dashboard-sidebar"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
        メニュー
      </button>
      <aside
        id="dashboard-sidebar"
        className={open ? `${styles.sidebar} ${styles.sidebarOpen}` : styles.sidebar}
      >
        <div className={styles.brand}>
          <span>MEO AIO</span>
          <strong>School OS</strong>
        </div>
        <nav className={styles.nav} aria-label="管理メニュー">
          {dashboardNavItems.map((item) => {
            const active = isActive(pathname, item);

            return (
              <div key={item.href} className={styles.navGroup}>
                <Link
                  href={item.href}
                  className={active ? `${styles.navLink} ${styles.active}` : styles.navLink}
                  onClick={() => setOpen(false)}
                >
                  <NavIcon type={item.icon} />
                  <span>{item.label}</span>
                </Link>
                {item.children ? (
                  <div className={styles.children}>
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={
                          pathname === child.href
                            ? `${styles.childLink} ${styles.childActive}`
                            : styles.childLink
                        }
                        onClick={() => setOpen(false)}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      {open ? (
        <button
          type="button"
          className={styles.backdrop}
          onClick={() => setOpen(false)}
          aria-label="メニューを閉じる"
        />
      ) : null}
    </>
  );
}
