import { test as base, expect, type Page, type Route } from "@playwright/test";
import { installFixture, type FixtureState } from "./fixtures";
import { buildDashboardOverview } from "../src/lib/dashboard-summary";

const canonicalOrigin = "https://app.jukumeo.com";
const loopbackOrigin = "http://127.0.0.1:4317";
const authOrigin = "http://127.0.0.1:54321";
const callbackUrl = `${canonicalOrigin}/auth/callback`;
const sessionKey = "sb-127-auth-token";
const accounts = {
  admin: "invincible.20.252.dice@gmail.com",
  general: "ischooljunior.company@gmail.com",
};

type OAuthFixture = {
  base: FixtureState;
  authorize: URL[];
  callbacks: Array<{ origin: string; pathname: string; status: number }>;
  active: boolean;
  role: "admin" | "staff";
  authorizedReads: number;
};

async function installOAuthFixture(page: Page): Promise<OAuthFixture> {
  // Unlike the older fixtures, this flow starts with empty browser storage.
  // The real SDK can establish its synthetic session only through the callback.
  const fixture = await installFixture(page, { origin: canonicalOrigin, seedSession: false });
  const state: OAuthFixture = { base: fixture, authorize: [], callbacks: [], active: false, role: "admin", authorizedReads: 0 };
  const expiresAt = Math.floor(Date.now() / 1000) + 36000;
  // Unsigned, test-only data. It cannot authenticate to any real provider.
  const token = [
    { alg: "HS256", typ: "JWT" },
    { sub: "test-user", exp: expiresAt, aud: "authenticated" },
  ].map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".dGVzdC1vbmx5";
  const user = { id: "test-user", email: "fixture@example.invalid", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({
    status, contentType: "application/json", body: JSON.stringify(body),
    headers: {
      "access-control-allow-origin": canonicalOrigin,
      "access-control-allow-headers": "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    },
  });

  await page.route(`${authOrigin}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "OPTIONS") return json(route, {});
    if (url.pathname === "/auth/v1/authorize") {
      state.authorize.push(url);
      // Only the external identity-provider boundary is simulated. The app's
      // callback page and Supabase SDK perform URL parsing and session storage.
      const callback = new URL(url.searchParams.get("redirect_to") || "");
      expect(callback.href).toBe(callbackUrl);
      callback.hash = new URLSearchParams({
        access_token: token, refresh_token: "test-only-refresh", token_type: "bearer",
        expires_in: "36000", expires_at: String(expiresAt), type: "signup",
      }).toString();
      // Playwright routes only the first URL of an HTTP redirect chain. Use a
      // separate document navigation so the callback is intercepted as well.
      return route.fulfill({ contentType: "text/html", body:
        `<p>Synthetic OAuth provider</p><script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    if (url.pathname === "/auth/v1/user") {
      expect(request.headers().authorization).toBe(`Bearer ${token}`);
      state.active = true;
      return json(route, user);
    }
    if (url.pathname === "/auth/v1/logout" && request.method() === "POST") {
      fixture.logoutScopes.push(url.searchParams.get("scope") || "");
      state.active = false;
      return json(route, {});
    }
    if (url.pathname === "/rest/v1/profiles") return json(route, {
      id: "test-user", role: state.role, status: "active", school_ids: ["school-a"], full_name: "検証担当",
    });
    return route.fallback();
  });

  await page.route(`${canonicalOrigin}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      if (!state.active || request.headers().authorization !== `Bearer ${token}`) {
        return json(route, { authenticated: false, approved: false }, 401);
      }
      state.authorizedReads++;
      if (url.pathname === "/api/auth/me") return json(route, {
        authenticated: true, approved: true, status: "active", role: state.role,
      });
      if (url.pathname === "/api/dashboard/context") return json(route, {
        user: { name: "検証担当", role: state.role }, schools: [{ id: "school-a", name: "検証用A校" }],
        currentSchoolId: "school-a", currentSchoolName: "検証用A校", canSwitchSchool: state.role === "admin",
      });
      if (url.pathname === "/api/dashboard/overview") return json(route, {
        success: true, schoolId: "school-a", schoolName: "検証用A校", schoolCount: 1,
        summary: buildDashboardOverview({ reviews: [], keywords: [], queries: [], alerts: [] }, new Date()),
      });
      return route.fallback();
    }
    // Never send virtual canonical requests to production. Preserve Next's RSC
    // headers so callback navigation uses the same application router as users.
    const headers = Object.fromEntries(Object.entries(request.headers()).filter(([key]) =>
      ["accept", "rsc", "next-router-state-tree", "next-router-prefetch", "next-url"].includes(key)));
    const response = await page.request.get(`${loopbackOrigin}${url.pathname}${url.search}`, { headers, maxRedirects: 0 });
    expect(response.status(), `Isolated app response ${url.pathname}`).toBe(200);
    if (url.pathname === "/auth/callback") state.callbacks.push({ origin: url.origin, pathname: url.pathname, status: response.status() });
    return route.fulfill({ response });
  });
  return state;
}

const test = base.extend<{ oauth: OAuthFixture }>({
  oauth: [async ({ page }, use) => {
    const fixture = await installOAuthFixture(page);
    await use(fixture);
    expect(fixture.base.unexpected, "No real provider, production, or unmocked API request").toEqual([]);
  }, { auto: true }],
});

// Defense in depth: even a browser redirect that bypasses Playwright routing
// cannot resolve production or provider hosts. APIRequestContext uses loopback.
test.use({ launchOptions: { args: ["--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] } });

function assertOAuthRequest(url: URL, hint?: string) {
  expect(url.origin).toBe(authOrigin);
  expect(url.pathname).toBe("/auth/v1/authorize");
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe(callbackUrl);
  expect(url.searchParams.get("scopes")).toBe("https://www.googleapis.com/auth/business.manage");
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("prompt")).toBe("consent");
  expect(url.searchParams.get("login_hint")).toBe(hint ?? null);
  expect([...url.searchParams.keys()].sort()).toEqual([
    "access_type", ...(hint ? ["login_hint"] : []), "prompt", "provider", "redirect_to", "scopes",
  ].sort());
}

async function expectDashboard(page: Page) {
  await expect(page).toHaveURL(new RegExp(`^${canonicalOrigin.replaceAll(".", "\\.")}/dashboard(?:\\?|$)`));
  await expect(page.getByRole("heading", { name: "店舗運用ダッシュボード", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "校舎の運用指標" })).toBeVisible();
  expect(await page.evaluate(key => Boolean(localStorage.getItem(key)), sessionKey)).toBe(true);
}

for (const account of ["normal", "admin", "general"] as const) {
  test(`${account} OAuth callback, reload, local logout, protected entry and normal re-login`, async ({ page, oauth }, testInfo) => {
    oauth.role = account === "general" ? "staff" : "admin";
    const query = account === "normal" ? "" : `?auth_verification=1&account_type=${account}`;
    await page.goto(`${canonicalOrigin}/login${query}`);
    expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
    await expect(page.getByText(accounts.admin, { exact: false })).toHaveCount(0);
    await expect(page.getByText(accounts.general, { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: /Googleでログイン/ }).click();
    await expectDashboard(page);
    expect(oauth.authorize).toHaveLength(1);
    assertOAuthRequest(oauth.authorize[0], account === "normal" ? undefined : accounts[account]);
    expect(oauth.callbacks).toEqual([{ origin: canonicalOrigin, pathname: "/auth/callback", status: 200 }]);
    await page.reload();
    await expectDashboard(page);
    await page.getByRole("navigation", { name: "アカウント操作" }).getByRole("link", { name: "設定", exact: true }).click();
    await expect(page.getByRole("heading", { name: "設定", exact: true })).toBeVisible();
    await expect(page.getByText("連携済み", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${account}-synthetic-settings.png`), fullPage: true });
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(`${canonicalOrigin}/login`);
    expect(oauth.base.logoutScopes).toEqual(["local"]);
    expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
    await page.reload();
    await expect(page.getByRole("heading", { name: "ログイン", exact: true })).toBeVisible();
    const readsAfterLogout = oauth.authorizedReads;
    for (const path of ["/dashboard", "/dashboard/settings?schoolId=school-a"]) {
      await page.goto(`${canonicalOrigin}${path}`);
      await expect(page).toHaveURL(`${canonicalOrigin}/login`);
      await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toHaveCount(0);
    }
    await page.goBack();
    await expect(page).toHaveURL(`${canonicalOrigin}/login`);
    await expect(page.getByRole("heading", { name: "ログイン", exact: true })).toBeVisible();
    expect(oauth.authorizedReads).toBe(readsAfterLogout);
    // Logout returns to ordinary /login; a previous verification hint is not sticky.
    await page.getByRole("button", { name: /Googleでログイン/ }).click();
    await expectDashboard(page);
    expect(oauth.authorize).toHaveLength(2);
    assertOAuthRequest(oauth.authorize[1]);
    expect(oauth.callbacks).toHaveLength(2);
    await page.reload();
    await expectDashboard(page);
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(`${canonicalOrigin}/login`);
    expect(oauth.base.logoutScopes).toEqual(["local", "local"]);
    expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
    await page.screenshot({ path: testInfo.outputPath(`${account}-synthetic-logged-out.png`), fullPage: true });
  });
}

for (const { name, query, error } of [
  { name: "unsupported account", query: "auth_verification=1&account_type=owner", error: "検証用アカウントの指定が正しくありません。" },
  { name: "missing account", query: "auth_verification=1", error: "検証用アカウントの指定が正しくありません。" },
  { name: "arbitrary email as account", query: "auth_verification=1&account_type=attacker%40example.invalid", error: "検証用アカウントの指定が正しくありません。" },
  { name: "duplicate account", query: "auth_verification=1&account_type=admin&account_type=general", error: "検証用アカウントの指定が正しくありません。" },
  { name: "unsupported mode", query: "auth_verification=true&account_type=admin", error: "検証モードの指定が正しくありません。" },
  { name: "duplicate mode", query: "auth_verification=0&auth_verification=1&account_type=admin", error: "検証モードの指定が正しくありません。" },
]) {
  test(`reject ${name} before any OAuth request`, async ({ page, oauth }) => {
    await page.goto(`${canonicalOrigin}/login?${query}`);
    await page.getByRole("button", { name: /Googleでログイン/ }).click();
    await expect(page.getByText(error, { exact: true })).toBeVisible();
    expect(oauth.authorize).toHaveLength(0);
    expect(oauth.callbacks).toHaveLength(0);
    expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  });
}

for (const { name, selectors, hint } of [
  { name: "default OFF", selectors: "account_type=admin", hint: undefined },
  { name: "explicit OFF", selectors: "auth_verification=0&account_type=general", hint: undefined },
  { name: "fixed admin", selectors: "auth_verification=1&account_type=admin", hint: accounts.admin },
]) {
  test(`${name} ignores attempted email, redirect, scope and prompt injection`, async ({ page, oauth }) => {
    const injection = new URLSearchParams({
      login_hint: "attacker@example.invalid", email: "attacker@example.invalid",
      redirect_to: "https://attacker.example.invalid/auth/callback", scopes: "openid", prompt: "select_account",
    });
    await page.goto(`${canonicalOrigin}/login?${selectors}&${injection}`);
    await page.getByRole("button", { name: /Googleでログイン/ }).click();
    await expectDashboard(page);
    expect(oauth.authorize).toHaveLength(1);
    assertOAuthRequest(oauth.authorize[0], hint);
  });
}
