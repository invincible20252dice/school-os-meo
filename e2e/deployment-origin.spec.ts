import { test, expect } from "./fixtures";

for (const [origin, allowed] of [
  ["https://school-os-e2e-isolated.vercel.app", true],
  ["https://school-os-other.vercel.app", false],
] as const) {
  test(`server policy ${allowed ? "allows exact" : "denies different"} deployment origin`, async ({ page }, testInfo) => {
    let policyCalls = 0;
    // Virtual HTTPS origin. Assets and policy execute on the isolated Next server;
    // no request reaches Vercel, Supabase production or Google.
    await page.route(`${origin}/**`, async route => {
      const url = new URL(route.request().url());
      const local = `http://127.0.0.1:4317${url.pathname}${url.search}`;
      if (url.pathname === "/api/auth/deployment-origin") {
        policyCalls++;
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers().origin).toBe(origin);
        const response = await page.request.post(local, { headers: { Origin: origin }, maxRedirects: 0 });
        expect(response.status()).toBe(allowed ? 200 : 403);
        return route.fulfill({ response });
      }
      if (url.pathname !== "/login" && !url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/service-logo")) return route.abort();
      return route.fulfill({ response: await page.request.get(local, { maxRedirects: 0 }) });
    });
    await page.goto(`${origin}/login`);
    await page.getByRole("button", { name: /Google/ }).click();
    if (allowed) {
      await expect(page).toHaveURL(/127\.0\.0\.1:54321\/auth\/v1\/authorize/);
      expect(new URL(page.url()).searchParams.get("redirect_to")).toBe(`${origin}/auth/callback`);
    } else {
      await expect(page.getByText("このURLからはログインを開始できません。", { exact: true })).toBeVisible();
      await expect(page).toHaveURL(`${origin}/login`);
      await page.screenshot({ path: testInfo.outputPath("deployment-origin-denied.png"), fullPage: true });
    }
    expect(policyCalls).toBe(1);
  });
}

test("policy network failure keeps login retryable without provider navigation", async ({ page }) => {
  await page.route("**/api/auth/deployment-origin", route => route.abort());
  await page.goto("/login");
  await page.getByRole("button", { name: /Google/ }).click();
  await expect(page.getByText("このURLからはログインを開始できません。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Google/ })).toBeEnabled();
  await expect(page).toHaveURL("http://127.0.0.1:4317/login");
});
