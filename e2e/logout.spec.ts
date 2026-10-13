import { test, expect } from "./fixtures";

test("local logout clears the synthetic session and blocks reload, direct entry and back", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/settings/google?schoolId=school-a");
  await expect(page.getByText("連携済み", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("連携済み", { exact: true }).first()).toBeVisible();
  await page.evaluate(() => localStorage.setItem("unrelated-preference", "keep"));
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(fixture.logoutScopes).toEqual(["local"]);
  expect(await page.evaluate(() => localStorage.getItem("sb-127-auth-token"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("unrelated-preference"))).toBe("keep");
  const businessCalls = () => fixture.calls.filter(c => c.path !== "/api/auth/me").length;
  const before = businessCalls();
  for (const path of ["/dashboard", "/dashboard/settings/google?schoolId=school-a"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "ログアウト", exact: true })).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "ログイン", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  expect(businessCalls()).toBe(before);
  await page.screenshot({ path: testInfo.outputPath("logged-out.png"), fullPage: true });
});

test("failed SDK logout stays visible without protected content or a false success redirect", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/settings/google?schoolId=school-a");
  await expect(page.getByText("連携済み", { exact: true }).first()).toBeVisible();
  fixture.logoutFailure = true;
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ログアウトを完了できませんでした" })).toContainText("ログアウトを完了できませんでした");
  await expect(page).toHaveURL(/\/dashboard\/settings\/google/);
  await expect(page.getByText("連携済み", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("sb-127-auth-token"))).toBeNull();
  await page.screenshot({ path: testInfo.outputPath("logout-failure.png"), fullPage: true });
  fixture.logoutFailure = false;
  await page.getByRole("button", { name: "ログアウトを再試行", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});
