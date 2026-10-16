import { test, expect } from "./fixtures";

// Virtual browser origins; every application response comes from the same local
// production build. No DNS request or OAuth request reaches a live provider.
for (const origin of [
  "https://staging.jukumeo.com",
  "https://app.jukumeo.com",
  "https://school-os-meo.vercel.app",
  "https://app.jukumeo.com.evil.invalid",
  "https://app.jukumeo.com:444",
]) {
  test(`Google callback boundary at ${origin}`, async ({ page }, testInfo) => {
    const allowed = ["https://staging.jukumeo.com", "https://app.jukumeo.com", "https://school-os-meo.vercel.app"].includes(origin);
    await page.route(`${origin}/**`, async route => {
      const url = new URL(route.request().url());
      if (url.pathname !== "/login" && !url.pathname.startsWith("/_next/") && url.pathname !== "/service-logo.png" && url.pathname !== "/favicon.ico") {
        throw new Error(`Unexpected virtual-origin path: ${url.pathname}`);
      }
      const response = await route.fetch({ url: `http://127.0.0.1:4317${url.pathname}${url.search}`, maxRedirects: 0 });
      await route.fulfill({ response });
    });
    const oauthRequests: string[] = [];
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/auth/v1/authorize") oauthRequests.push(request.url());
    });
    await page.goto(`${origin}/login?redirectTo=https://evil.invalid`);
    await expect(page.getByRole("heading", { name: "ログイン", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Google/ }).click();
    if (allowed) {
      await expect(page).toHaveURL(/127\.0\.0\.1:54321\/auth\/v1\/authorize/);
      expect(oauthRequests).toHaveLength(1);
      const params = new URL(oauthRequests[0]).searchParams;
      expect(params.get("provider")).toBe("google");
      expect(params.get("redirect_to")).toBe(`${origin}/auth/callback`);
      expect(params.get("scopes")).toBe("https://www.googleapis.com/auth/business.manage");
      expect(params.get("access_type")).toBe("offline");
      expect(params.get("prompt")).toBe("consent");
    } else {
      await expect(page.getByText("このURLではGoogleログインを開始できません。正規のログインURLをご利用ください。")).toBeVisible();
      expect(new URL(page.url()).origin).toBe(origin);
      expect(oauthRequests).toEqual([]);
      await expect(page.getByRole("button", { name: /Google/ })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath("rejected-origin.png"), fullPage: true });
    }
  });
}
