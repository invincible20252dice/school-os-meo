"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./users.module.css";

type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  schoolId: string;
  status: string;
  createdAt: string;
  lastSignInAt: string | null;
};

type SchoolOption = {
  id: string;
  name: string;
};

type UsersPayload = {
  users?: ManagedUser[];
  schools?: SchoolOption[];
  message?: string;
};

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-5" />
    </svg>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "未ログイン";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "日時不明";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  const token = data.session?.access_token;

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function UsersManagementClient() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  async function loadUsers() {
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        headers: await getAuthHeaders(),
        cache: "no-store",
      });
      const payload = (await response.json()) as UsersPayload;

      if (!response.ok) {
        throw new Error(payload.message || "ユーザー一覧を取得できませんでした。");
      }

      setUsers(payload.users || []);
      setSchools(payload.schools || []);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ユーザー一覧を取得できませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function updateUser(userId: string, patch: Partial<ManagedUser>) {
    setUsers((current) =>
      current.map((user) => (user.id === userId ? { ...user, ...patch } : user)),
    );
  }

  async function saveUser(user: ManagedUser, status: "active" | "pending") {
    setSavingUserId(user.id);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({
          userId: user.id,
          role: user.role,
          schoolId: user.schoolId,
          status,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || "ユーザー権限を更新できませんでした。");
      }

      updateUser(user.id, { status });
      setMessage(status === "active" ? "ユーザーを承認しました。" : "承認待ちに戻しました。");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ユーザー権限を更新できませんでした。",
      );
    } finally {
      setSavingUserId(null);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>User Access</p>
        <h1>ユーザー・権限管理</h1>
        <p>本部管理者がログインユーザーの承認、権限、担当校舎を管理します。</p>
      </header>

      <section className={styles.summary}>
        <ShieldIcon />
        <div>
          <h2>承認フロー</h2>
          <p>pending のユーザーはダッシュボードへ入れず、承認待ち画面に誘導されます。</p>
        </div>
        <button type="button" onClick={loadUsers} disabled={isLoading}>
          {isLoading ? "取得中" : "再取得"}
        </button>
      </section>

      {message ? <p className={styles.notice}>{message}</p> : null}

      <section className={styles.panel}>
        {isLoading ? (
          <p className={styles.empty}>ユーザー一覧を読み込んでいます。</p>
        ) : users.length === 0 ? (
          <p className={styles.empty}>管理対象ユーザーはまだありません。</p>
        ) : (
          <div className={styles.table}>
            {users.map((user) => (
              <article className={styles.row} key={user.id}>
                <div className={styles.identity}>
                  <strong>{user.fullName || user.email || "名前未設定"}</strong>
                  <span>{user.email || user.id}</span>
                  <small>最終ログイン: {formatDate(user.lastSignInAt)}</small>
                </div>
                <label>
                  <span>権限</span>
                  <select
                    value={user.role}
                    onChange={(event) =>
                      updateUser(user.id, {
                        role: event.target.value,
                        schoolId:
                          event.target.value === "admin" ? "" : user.schoolId,
                      })
                    }
                  >
                    <option value="manager">教室長</option>
                    <option value="admin">本部</option>
                  </select>
                </label>
                <label>
                  <span>担当校舎</span>
                  <select
                    value={user.schoolId}
                    disabled={user.role === "admin"}
                    onChange={(event) =>
                      updateUser(user.id, { schoolId: event.target.value })
                    }
                  >
                    <option value="">未割り当て</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={styles.status}>
                  <span
                    className={
                      user.status === "active" ? styles.active : styles.pending
                    }
                  >
                    {user.status === "active" ? "承認済み" : "承認待ち"}
                  </span>
                </div>
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() => saveUser(user, "active")}
                    disabled={savingUserId === user.id}
                  >
                    承認
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => saveUser(user, "pending")}
                    disabled={savingUserId === user.id}
                  >
                    保留
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
