import { test, expect } from "./fixtures";

test("saved Google inquiry and meeting hide stale results until read-only recovery", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/roi?schoolId=school-a");
  const outcomes = page.getByRole("region", { name: "実際の成果" });
  await expect(outcomes).toContainText("期間内の問い合わせ 0件のうち、現在面談 0件");
  await page.getByRole("button", { name: "LINE +1", exact: true }).click();
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、現在面談 0件");
  fixture.failNextLeadRead = true;
  await page.getByRole("button", { name: "面談になった", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "保存済みですが一覧を再取得できませんでした。" })).toHaveText("保存済みですが一覧を再取得できませんでした。再取得してください。");
  await expect(outcomes).toHaveCount(0);
  await expect(page.getByRole("button", { name: "LINE +1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "面談になった", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("google-results-read-failure.png"), fullPage: true });
  await page.getByRole("button", { name: "再取得", exact: true }).click();
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、現在面談 1件");
  await expect(outcomes).toContainText("100%");
  await page.reload();
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、現在面談 1件");
  await expect(page.getByRole("table")).toContainText("1件1件");
  await page.screenshot({ path: testInfo.outputPath("google-results-recovered.png"), fullPage: true });
  await page.goto("/dashboard/roi?schoolId=school-b");
  await expect(outcomes).toContainText("期間内の問い合わせ 0件のうち、現在面談 0件");
  await page.goto("/dashboard/roi?schoolId=school-a");
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、現在面談 1件");
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/google-results" && c.method !== "GET").map(c => c.method)).toEqual(["POST", "PATCH"]);
});
