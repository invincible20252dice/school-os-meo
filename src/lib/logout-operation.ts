import { createBrowserSupabaseClient } from "./supabase";
import { clearLeadRecovery } from "./google-lead-recovery-storage";

type LogoutPhase = "idle" | "pending" | "failed" | "complete";
type Operation = { phase: LogoutPhase; listeners: Set<() => void> };
// Document-local UI coordination only. Never retains tokens or restores Auth storage.
const operations = new WeakMap<Window, Operation>();
function operation(): Operation {
  let value = operations.get(window);
  if (!value) { value = { phase: "idle", listeners: new Set() }; operations.set(window, value); }
  return value;
}
export const getServerLogoutPhase = (): LogoutPhase => "idle";
export const getLogoutPhase = (): LogoutPhase => typeof window === "undefined" ? "idle" : operation().phase;
export function subscribeLogout(listener: () => void) {
  const value = operation();
  value.listeners.add(listener);
  return () => { value.listeners.delete(listener); };
}
function publish(value: Operation, phase: LogoutPhase) {
  value.phase = phase;
  for (const listener of value.listeners) listener();
}
export async function startLocalLogout(): Promise<void> {
  const value = operation();
  if (value.phase === "pending" || value.phase === "complete") return;
  // Publish before SDK entry: SIGNED_OUT can precede a returned error (SDK 2.110.8).
  publish(value, "pending");
  try {
    const { error } = await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    if (error) throw error;
    if (!clearLeadRecovery()) throw new Error("Recovery cleanup unavailable");
    publish(value, "complete");
    window.location.replace("/login");
  } catch {
    publish(value, "failed");
  }
}
