import type { SupabaseClient } from "@supabase/supabase-js";

/** Revoke this login session only; independent sessions remain signed in. */
export async function signOutCurrentSession(client: Pick<SupabaseClient, "auth">) {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw new Error("ログアウトを完了できませんでした。再試行してください。");
  const result = await client.auth.getSession();
  if (result.error || result.data.session) {
    throw new Error("ログアウトを確認できませんでした。再試行してください。");
  }
}

export function leaveDashboard() {
  // Discard Next's in-memory router cache as well as the current history entry.
  window.location.replace("/login");
}
