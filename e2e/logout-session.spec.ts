import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { installFixture, syntheticUserId } from "./fixtures";
import { LEAD_RECOVERY_STORAGE_KEY } from "../src/lib/google-lead-recovery-storage";

type SDKWindow = Window & { supabase: { createClient: (url: string, key: string) => SupabaseClient }; logoutTestClient: SupabaseClient };
const authOrigin = "http://127.0.0.1:54321";
const appOrigin = "http://127.0.0.1:4317";
const storageKey = "sb-127-auth-token";
const user = { id: syntheticUserId, email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp, aud: "authenticated" })}.synthetic-signature`, refresh_token: "local-mock-refresh", expires_in: 3600, token_type: "bearer", user };
}
async function sdk(page: Page) {
  await page.addScriptTag({ path: "node_modules/@supabase/supabase-js/dist/umd/supabase.js" });
  await page.evaluate(() => {
    const w = window as unknown as SDKWindow;
    w.logoutTestClient = w.supabase.createClient("http://127.0.0.1:54321", "school-os-test-only");
  });
}
async function login(page: Page) {
  await sdk(page);
  expect(await page.evaluate(async () => {
    const { data, error } = await (window as unknown as SDKWindow).logoutTestClient.auth.signInWithPassword({ email: "fixture@example.invalid", password: "synthetic-test-only" });
    return { signedIn: !!data.session, error: !!error };
  })).toEqual({ signedIn: true, error: false });
}
async function getSession(page: Page) {
  await sdk(page);
  return page.evaluate(async () => {
    const { data, error } = await (window as unknown as SDKWindow).logoutTestClient.auth.getSession();
    return { signedIn: !!data.session, error: !!error };
  });
}
async function mockAuth(page: Page) {
  const state = { logouts: [] as string[], tokenGrants: [] as string[], fail: false, release: null as null | (() => void), block: false };
  await page.route(`${authOrigin}/auth/v1/**`, async route => {
    const url = new URL(route.request().url());
    const headers = { "access-control-allow-origin": appOrigin, "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith("/logout")) {
      state.logouts.push(url.searchParams.get("scope") ?? "missing");
      if (state.block) await new Promise<void>(resolve => { state.release = resolve; });
      return route.fulfill({ status: state.fail ? 503 : 204, headers, body: state.fail ? JSON.stringify({ message: "synthetic outage" }) : undefined });
    }
    if (url.pathname.endsWith("/token")) {
      state.tokenGrants.push(url.searchParams.get("grant_type") ?? "missing");
      return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(session()) });
    }
    if (url.pathname.endsWith("/user")) return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(user) });
    throw new Error(`Unexpected local auth endpoint: ${url.pathname}`);
  });
  return state;
}
for (const role of ["admin", "manager"] as const) {
  test(`${role}: real SDK local logout, reload, protected URLs, back, re-login and repeat`, async ({ page }, info) => {
    const fixture = await installFixture(page, undefined, { seedSession: false, role });
    const auth = await mockAuth(page);
    await page.goto("/login");
    await login(page);
    // Start on a fixture-supported protected page; overview data is outside this auth test.
    await page.goto("/dashboard/settings?schoolId=school-a");
    await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toBeVisible();
    expect(await getSession(page)).toEqual({ signedIn: true, error: false });
    // Real SDK token refresh against a local endpoint, no OAuth or live service.
    expect(await page.evaluate(async () => !(await (window as unknown as SDKWindow).logoutTestClient.auth.refreshSession()).error)).toBe(true);
    await page.evaluate(key => { sessionStorage.setItem(key, "synthetic-recovery-marker"); localStorage.setItem("unrelated", "preserved"); }, LEAD_RECOVERY_STORAGE_KEY);
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(auth.logouts).toEqual(["local"]);
    expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
    expect(await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("unrelated"))).toBe("preserved");
    expect(await getSession(page)).toEqual({ signedIn: false, error: false });
    await page.reload();
    expect(await getSession(page)).toEqual({ signedIn: false, error: false });
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toHaveCount(0);
    for (const path of ["/dashboard", "/dashboard/settings"]) {
      await page.goto(path); await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: info.outputPath(`${role}-logged-out.png`), fullPage: true });
    await login(page); await page.goto("/dashboard/settings?schoolId=school-a");
    await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toBeVisible();
    await page.reload();
    expect(await getSession(page)).toEqual({ signedIn: true, error: false });
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(await getSession(page)).toEqual({ signedIn: false, error: false });
    expect(auth.logouts).toEqual(["local", "local"]);
    expect(auth.tokenGrants).toEqual(["password", "refresh_token", "password"]);
    expect(fixture.unexpected).toEqual([]);
    await info.attach("session-evidence", { contentType: "application/json", body: JSON.stringify({ role, viewport: info.project.name, logouts: auth.logouts, tokenGrants: auth.tokenGrants, sessionAfterLogout: null, storageRemoved: true, protectedPaths: ["/dashboard", "/dashboard/settings"], reload: true, back: true, reLogin: true }) });
  });
}
test("SDK logout error preserves page/recovery; duplicate click is blocked and retry succeeds", async ({ page }, info) => {
  const fixture = await installFixture(page, undefined, { seedSession: false });
  const auth = await mockAuth(page); auth.fail = true; auth.block = true;
  await page.goto("/login"); await login(page); await page.goto("/dashboard/roi?schoolId=school-a");
  const button = page.getByRole("button", { name: "ログアウト", exact: true }); await expect(button).toBeVisible();
  fixture.failNextLeadResponseAfterSave = true;
  await page.getByRole("button", { name: "LINE +1", exact: true }).click();
  await expect(page.getByRole("region", { name: "前回の登録", exact: true })).toBeVisible();
  const recoveryBefore = await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY);
  expect(recoveryBefore).not.toBeNull();
  await button.dblclick(); await expect(page.getByRole("status").filter({ hasText: "ログアウト中です" })).toBeVisible();
  await expect.poll(() => auth.logouts.length).toBe(1);
  auth.release!();
  try {
    await expect(page.getByRole("alert").filter({ hasText: "ログアウトできませんでした" })).toBeVisible();
  } finally {
    await info.attach("failed-logout-observation", { contentType: "application/json", body: JSON.stringify({
      scope: auth.logouts, session: await getSession(page), recoveryBefore,
      recoveryAfter: await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY),
      url: page.url(), errorVisible: await page.getByRole("alert").filter({ hasText: "ログアウトできませんでした" }).isVisible(),
    }) });
  }
  await expect(page).toHaveURL(/\/dashboard\/roi\?schoolId=school-a$/);
  expect(await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY)).toBe(recoveryBefore);
  await page.screenshot({ path: info.outputPath("logout-retry.png"), fullPage: true });
  auth.fail = false; auth.block = false; await page.getByRole("button", { name: "ログアウトを再試行", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  // SDK already removed the session on 503; retry still calls SDK signOut,
  // which succeeds locally without sending a second token-less HTTP logout.
  expect(auth.logouts).toEqual(["local"]);
  expect(await getSession(page)).toEqual({ signedIn: false, error: false });
});
for (const outcome of ["cancel", "commit"] as const) test(`logout failure during an in-flight inquiry: late ${outcome} does not replay or display customer data`, async ({ page }) => {
  const fixture = await installFixture(page, undefined, { seedSession: false });
  const auth = await mockAuth(page); auth.fail = true;
  await page.goto("/login"); await login(page); await page.goto("/dashboard/roi?schoolId=school-a");
  const barrier = fixture.leadServer.blockNextPostBeforeCommit();
  await page.getByRole("button", { name: "LINE +1", exact: true }).click(); await barrier.received;
  const before = await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY);
  expect(before).not.toBeNull();
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ログアウトできませんでした" })).toBeVisible();
  if (outcome === "cancel") barrier.cancel(); else barrier.commit();
  await barrier.cancelled;
  await expect(page.getByRole("region", { name: "実際の成果", exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY)).toBe(before);
  expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(1);
  expect(fixture.leadServer.count("school-a")).toBe(outcome === "commit" ? 1 : 0);
  auth.fail = false;
  await page.getByRole("button", { name: "ログアウトを再試行" }).click(); await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(key => sessionStorage.getItem(key), LEAD_RECOVERY_STORAGE_KEY)).toBeNull();
  expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(1);
});
