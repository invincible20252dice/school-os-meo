"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

type Invitation = {
  email: string;
  role: string;
  schoolId: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
};

type UsersPayload = {
  users?: ManagedUser[];
  schools?: SchoolOption[];
  invitations?: Invitation[];
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.smallIcon}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
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

async function getAccessToken() {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  return data.session?.access_token || "";
}

function buildAuthHeaders(token: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function UsersManagementClient() {
  const router = useRouter();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "manager">("manager");
  const [inviteSchoolId, setInviteSchoolId] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});
  const [isSavingInvite, setIsSavingInvite] = useState(false);
  const [isSavingSchool, setIsSavingSchool] = useState(false);

  async function loadUsers(currentToken = token) {
    setIsLoading(true);
    setMessage(null);

    try {
      const accessToken = currentToken || (await getAccessToken());

      if (!accessToken) {
        router.replace("/login");
        return;
      }

      const accessResponse = await fetch("/api/auth/me", {
        headers: buildAuthHeaders(accessToken),
        cache: "no-store",
      });
      const accessPayload = (await accessResponse.json()) as {
        approved?: boolean;
        access?: { role?: string };
      };

      if (!accessResponse.ok || !accessPayload.approved) {
        router.replace("/pending");
        return;
      }

      if (accessPayload.access?.role !== "admin") {
        router.replace("/dashboard");
        return;
      }

      setToken(accessToken);
      const response = await fetch("/api/admin/users", {
        headers: buildAuthHeaders(accessToken),
        cache: "no-store",
      });
      const payload = (await response.json()) as UsersPayload;

      if (!response.ok) {
        throw new Error(payload.message || "ユーザー一覧を取得できませんでした。");
      }

      const nextSchools = payload.schools || [];
      setUsers(payload.users || []);
      setSchools(nextSchools);
      setInvitations(payload.invitations || []);
      setSchoolNames(
        Object.fromEntries(nextSchools.map((school) => [school.id, school.name])),
      );
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
          ...buildAuthHeaders(token),
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

  async function inviteUser() {
    setIsSavingInvite(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          schoolId: inviteRole === "admin" ? "" : inviteSchoolId,
        }),
      });
      const payload = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message || "招待を保存できませんでした。");
      }

      setInviteEmail("");
      setInviteRole("manager");
      setInviteSchoolId("");
      setMessage("招待を保存しました。対象メールでGoogleログインすると権限が自動適用されます。");
      await loadUsers(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "招待を保存できませんでした。",
      );
    } finally {
      setIsSavingInvite(false);
    }
  }

  async function saveSchool(method: "POST" | "PATCH" | "DELETE", payload: object) {
    setIsSavingSchool(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/schools", {
        method,
        headers: {
          "Content-Type": "application/json",
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(body.message || "校舎情報を保存できませんでした。");
      }

      setNewSchoolName("");
      setMessage(
        method === "DELETE"
          ? "校舎を一覧から削除しました。"
          : "校舎情報を保存しました。",
      );
      await loadUsers(token);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "校舎情報を保存できませんでした。",
      );
    } finally {
      setIsSavingSchool(false);
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
        <p>本部管理者がログインユーザーの招待、承認、権限、担当校舎を管理します。</p>
      </header>

      <section className={styles.summary}>
        <ShieldIcon />
        <div>
          <h2>承認フロー</h2>
          <p>pending のユーザーと未招待ユーザーはダッシュボードへ入れません。</p>
        </div>
        <button type="button" onClick={() => loadUsers()} disabled={isLoading}>
          {isLoading ? "取得中" : "再取得"}
        </button>
      </section>

      {message ? <p className={styles.notice}>{message}</p> : null}

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>新規ユーザー追加（招待）</h2>
          <p>事前登録済みのメールアドレスでGoogleログインすると、権限が自動適用されます。</p>
        </div>
        <div className={styles.formGrid}>
          <label>
            <span>メールアドレス</span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="manager@example.com"
            />
          </label>
          <label>
            <span>権限</span>
            <select
              value={inviteRole}
              onChange={(event) => {
                const role = event.target.value as "admin" | "manager";
                setInviteRole(role);
                if (role === "admin") {
                  setInviteSchoolId("");
                }
              }}
            >
              <option value="manager">教室長</option>
              <option value="admin">本部</option>
            </select>
          </label>
          <label>
            <span>担当校舎</span>
            <select
              value={inviteSchoolId}
              disabled={inviteRole === "admin"}
              onChange={(event) => setInviteSchoolId(event.target.value)}
            >
              <option value="">未割り当て</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={inviteUser} disabled={isSavingInvite}>
            <PlusIcon />
            招待を保存
          </button>
        </div>
        {invitations.length ? (
          <div className={styles.inviteList}>
            {invitations.map((invitation) => (
              <span key={invitation.email}>
                {invitation.email} / {invitation.role === "admin" ? "本部" : "教室長"} /{" "}
                {invitation.status === "accepted" ? "適用済み" : "招待中"}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>校舎管理</h2>
          <p>担当校舎の選択肢を追加・編集・削除できます。</p>
        </div>
        <div className={styles.schoolCreate}>
          <input
            type="text"
            value={newSchoolName}
            onChange={(event) => setNewSchoolName(event.target.value)}
            placeholder="新しい校舎名"
          />
          <button
            type="button"
            onClick={() => saveSchool("POST", { name: newSchoolName })}
            disabled={isSavingSchool}
          >
            <PlusIcon />
            追加
          </button>
        </div>
        <div className={styles.schoolList}>
          {schools.map((school) => (
            <article className={styles.schoolRow} key={school.id}>
              <input
                value={schoolNames[school.id] || ""}
                onChange={(event) =>
                  setSchoolNames((current) => ({
                    ...current,
                    [school.id]: event.target.value,
                  }))
                }
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() =>
                    saveSchool("PATCH", {
                      schoolId: school.id,
                      name: schoolNames[school.id],
                    })
                  }
                  disabled={isSavingSchool}
                >
                  保存
                </button>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => saveSchool("DELETE", { schoolId: school.id })}
                  disabled={isSavingSchool}
                >
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>ユーザー一覧</h2>
          <p>ログイン済みユーザーの権限と担当校舎を変更できます。</p>
        </div>
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
