import { test, expect } from "./fixtures";
import type { Locator } from "@playwright/test";

test("saved Google inquiry and meeting hide stale results until read-only recovery", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/roi?schoolId=school-a");
  const outcomes = page.getByRole("region", { name: "実際の成果" });
  await expect(outcomes).toContainText("期間内の問い合わせ 0件のうち、集計終了までに面談実施 0件・入塾 0件");
  await page.getByRole("button", { name: "LINE +1", exact: true }).click();
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、集計終了までに面談実施 0件・入塾 0件");
  await page.getByRole("button", { name: "面談予定にする", exact: true }).click();
  await expect(page.getByRole("button", { name: "実施を記録", exact: true })).toBeVisible();
  fixture.failNextLeadRead = true;
  await page.getByRole("button", { name: "実施を記録", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "保存済みですが一覧を再取得できませんでした。" })).toHaveText("保存済みですが一覧を再取得できませんでした。再取得してください。");
  await expect(outcomes).toHaveCount(0);
  await expect(page.getByRole("button", { name: "LINE +1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "面談予定にする", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("google-results-read-failure.png"), fullPage: true });
  await page.getByRole("button", { name: "再取得", exact: true }).click();
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、集計終了までに面談実施 1件・入塾 0件");
  await expect(outcomes).toContainText("100%");
  await page.reload();
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、集計終了までに面談実施 1件・入塾 0件");
  await expect(page.getByRole("table")).toContainText("1件1件");
  await page.screenshot({ path: testInfo.outputPath("google-results-recovered.png"), fullPage: true });
  await page.goto("/dashboard/roi?schoolId=school-b");
  await expect(outcomes).toContainText("期間内の問い合わせ 0件のうち、集計終了までに面談実施 0件・入塾 0件");
  await page.goto("/dashboard/roi?schoolId=school-a");
  await expect(outcomes).toContainText("期間内の問い合わせ 1件のうち、集計終了までに面談実施 1件・入塾 0件");
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/google-results" && c.method !== "GET").map(c => c.method)).toEqual(["POST", "PATCH", "PATCH"]);
});

test("help does not cover inquiry controls and remains accessible", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/roi?schoolId=school-a");
  const outcomes = page.getByRole("region", { name: "実際の成果" });
  await expect(outcomes).toBeVisible();
  const web = page.getByRole("button", { name: "Web +1", exact: true });
  await web.scrollIntoViewIfNeeded();
  // Hit-testing detects partial overlays; Playwright can otherwise scroll a
  // covered control out from under the fixed launcher and hide the regression.
  const unobstructed = (control: Locator) => control.evaluate(button => {
    const rect = button.getBoundingClientRect();
    return [0.25, 0.5, 0.75].every(x => [0.25, 0.5, 0.75].every(y =>
      button.contains(document.elementFromPoint(rect.x + rect.width * x, rect.y + rect.height * y))));
  });
  await page.screenshot({ path: testInfo.outputPath("google-results-controls.png") });
  expect(await unobstructed(web)).toBe(true);
  for (const [index, channel] of ["Web", "LINE", "電話"].entries()) {
    const control = page.getByRole("button", { name: `${channel} +1`, exact: true });
    await control.scrollIntoViewIfNeeded();
    expect(await unobstructed(control)).toBe(true);
    if (testInfo.project.name === "mobile") await control.tap();
    else await control.click();
    await expect(outcomes).toContainText(`期間内の問い合わせ ${index + 1}件のうち、集計終了までに面談実施 0件`);
  }
  const meeting = page.getByRole("button", { name: "面談予定にする", exact: true }).first();
  await meeting.scrollIntoViewIfNeeded();
  expect(await unobstructed(meeting)).toBe(true);
  await meeting.click();
  await page.getByRole("button", { name: "実施を記録", exact: true }).click();
  await page.getByRole("button", { name: "入塾を記録", exact: true }).click();
  await expect(outcomes).toContainText("期間内の問い合わせ 3件のうち、集計終了までに面談実施 1件・入塾 1件");
  const help = page.getByRole("button", { name: "使い方を聞く", exact: true });
  await help.click();
  const dialog = page.getByRole("dialog", { name: "使い方アシスタント" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("質問", { exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("google-results-help.png"), fullPage: true });
  await page.getByRole("button", { name: "ヘルプを閉じる" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(help).toBeFocused();
  await page.reload();
  await expect(outcomes).toContainText("期間内の問い合わせ 3件のうち、集計終了までに面談実施 1件・入塾 1件");
  if (testInfo.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 568 });
    for (const channel of ["Web", "LINE", "電話"]) {
      const control = page.getByRole("button", { name: `${channel} +1`, exact: true });
      await control.scrollIntoViewIfNeeded();
      expect(await unobstructed(control)).toBe(true);
      await control.click({ trial: true });
    }
    await page.screenshot({ path: testInfo.outputPath("google-results-narrow.png") });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("google-results-top.png"), fullPage: true });
  }
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/google-results" && c.method !== "GET").map(c => c.method)).toEqual(["POST", "POST", "POST", "PATCH", "PATCH", "PATCH"]);
});
