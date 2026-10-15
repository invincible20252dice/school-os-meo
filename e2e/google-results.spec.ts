import { test, expect } from "./fixtures";
import type { Locator } from "@playwright/test";

for (const action of ["edit", "delete"] as const) {
  test(`${action} of an uncertain saved inquiry resolves without replaying or recreating it`, async ({ page, fixture }, testInfo) => {
    await page.goto("/dashboard/roi?schoolId=school-a");
    const outcomes = page.getByRole("region", { name: "実際の成果" });
    const countText = (count: number) => `期間内の問い合わせ ${count}件のうち、集計終了までに面談実施 0件・入塾 0件`;
    const line = page.getByRole("button", { name: "LINE +1", exact: true });
    await expect(outcomes).toContainText(countText(0));
    fixture.failNextLeadResponseAfterSave = true;
    await line.click();
    const recovery = page.getByRole("region", { name: "前回の登録", exact: true });
    await expect(recovery).toBeVisible();
    await page.getByRole("button", { name: "電話 +1", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "新しい問い合わせの確認" });
    await expect(confirmation).toBeVisible();
    expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(1);
    await confirmation.getByRole("button", { name: "新しい問い合わせとして登録する", exact: true }).click();
    await expect(outcomes).toContainText(countText(2));
    const originalLine = page.getByRole("listitem").filter({ hasText: "学年未設定 ｜ LINE" });
    await originalLine.locator("summary").click();
    if (action === "edit") {
      await originalLine.getByRole("button", { name: "編集", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "問い合わせの編集" });
      await dialog.getByRole("combobox", { name: "経路", exact: true }).selectOption("web");
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    } else {
      await originalLine.getByRole("button", { name: "削除", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "問い合わせの削除" });
      await dialog.getByRole("button", { name: "削除する", exact: true }).click();
      await expect(dialog).not.toBeVisible();
    }
    const existingCount = action === "edit" ? 2 : 1;
    await expect(outcomes).toContainText(countText(existingCount));
    await recovery.getByRole("button", { name: "前回の登録状態を確認", exact: true }).click();
    await expect(recovery).toHaveCount(0);
    expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(2);
    expect(fixture.leadServer.events.filter(event => event.kind === "status-response").at(-1)?.operationState).toBe(action === "edit" ? "changed" : "deleted");
    await page.screenshot({ path: testInfo.outputPath(`google-inquiry-${action}-resolved.png`), fullPage: true });
    await line.click();
    await expect(outcomes).toContainText(countText(existingCount + 1));
    const posts = fixture.leadServer.events.filter(event => event.kind === "post-received");
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map(post => post.idempotencyKey)).size).toBe(3);
    const breakdown = `LINE 1件 / 電話 1件 / Web ${action === "edit" ? 1 : 0}件 / その他 0件`;
    await expect(page.getByText(breakdown, { exact: true })).toBeVisible();
    await page.reload();
    await expect(outcomes).toContainText(countText(existingCount + 1));
    await expect(page.getByText(breakdown, { exact: true })).toBeVisible();
    expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(3);
    await page.screenshot({ path: testInfo.outputPath(`google-inquiry-${action}-recovered.png`), fullPage: true });
  });
}

test("uncertain inquiries require new-registration confirmation and school switches discard their recovery identity", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/roi?schoolId=school-a");
  const outcomes = page.getByRole("region", { name: "実際の成果" });
  const countText = (count: number) => `期間内の問い合わせ ${count}件のうち、集計終了までに面談実施 0件・入塾 0件`;
  const line = page.getByRole("button", { name: "LINE +1", exact: true });
  const schools = page.getByRole("combobox", { name: "選択校舎" });
  const recovery = page.getByRole("region", { name: "前回の登録", exact: true });
  await expect(outcomes).toContainText(countText(0));
  fixture.failNextLeadResponseAfterSave = true;
  await line.click();
  await expect(recovery).toBeVisible();
  await page.getByRole("button", { name: "電話 +1", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "新しい問い合わせの確認" });
  await expect(confirmation).toBeVisible();
  expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(1);
  await confirmation.getByRole("button", { name: "新しい問い合わせとして登録する", exact: true }).click();
  await expect(outcomes).toContainText(countText(2));
  await expect(page.getByText("LINE 1件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  await schools.selectOption("school-b");
  await expect(outcomes).toContainText(countText(0));
  await expect(recovery).toHaveCount(0);
  await line.click();
  await expect(outcomes).toContainText(countText(1));
  await schools.selectOption("school-a");
  await expect(outcomes).toContainText(countText(2));
  await expect(recovery).toHaveCount(0);
  await line.click();
  await expect(outcomes).toContainText(countText(3));
  const posts = fixture.leadServer.events.filter(event => event.kind === "post-received");
  expect(posts).toHaveLength(4);
  expect(new Set(posts.map(post => post.idempotencyKey)).size).toBe(4);
  expect(posts.map(({ schoolId, channel }) => ({ schoolId, channel }))).toEqual([
    { schoolId: "school-a", channel: "line" }, { schoolId: "school-a", channel: "phone" },
    { schoolId: "school-b", channel: "line" }, { schoolId: "school-a", channel: "line" },
  ]);
  await page.reload();
  await expect(outcomes).toContainText(countText(3));
  await expect(page.getByText("LINE 2件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("google-inquiry-school-isolation.png"), fullPage: true });
  await schools.selectOption("school-b");
  await expect(outcomes).toContainText(countText(1));
  await page.reload();
  await expect(outcomes).toContainText(countText(1));
  await expect(page.getByText("LINE 1件 / 電話 0件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  expect(fixture.leadServer.events.filter(event => event.kind === "post-received")).toHaveLength(4);
});

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
