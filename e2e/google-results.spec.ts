import { test, expect } from "./fixtures";
import type { Locator } from "@playwright/test";

for (const action of ["edit", "delete"] as const) {
  test(`${action} of a saved inquiry rejects its old retry key and allows the next explicit registration`, async ({ page, fixture }, testInfo) => {
    const posts: Array<{ channel: string; idempotencyKey: string }> = [];
    const statuses: number[] = [];
    const isLeadPost = (url: string, method: string) => new URL(url).pathname === "/api/dashboard/google-results" && method === "POST";
    page.on("request", request => {
      if (isLeadPost(request.url(), request.method())) posts.push(request.postDataJSON());
    });
    page.on("response", response => {
      if (isLeadPost(response.url(), response.request().method())) statuses.push(response.status());
    });
    await page.goto("/dashboard/roi?schoolId=school-a");
    const outcomes = page.getByRole("region", { name: "実際の成果" });
    const countText = (count: number) => `期間内の問い合わせ ${count}件のうち、集計終了までに面談実施 0件・入塾 0件`;
    const line = page.getByRole("button", { name: "LINE +1", exact: true });
    await expect(outcomes).toContainText(countText(0));
    fixture.failNextLeadResponseAfterSave = true;
    await line.click();
    await expect(page.getByRole("status").filter({ hasText: "検証用の保存応答失敗" })).toHaveText("検証用の保存応答失敗");
    await page.getByRole("button", { name: "電話 +1", exact: true }).click();
    await expect(outcomes).toContainText(countText(2));
    const originalLine = page.getByRole("listitem").filter({ hasText: "学年未設定 ｜ LINE" });
    await expect(originalLine).toHaveCount(1);
    await originalLine.locator("summary").click();
    if (action === "edit") {
      await originalLine.getByRole("button", { name: "編集", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "問い合わせの編集" });
      await dialog.getByRole("combobox", { name: "経路", exact: true }).selectOption("web");
      await dialog.getByRole("button", { name: "保存", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByText("LINE 0件 / 電話 1件 / Web 1件 / その他 0件", { exact: true })).toBeVisible();
    } else {
      await originalLine.getByRole("button", { name: "削除", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "問い合わせの削除" });
      await dialog.getByRole("button", { name: "削除する", exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByText("LINE 0件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
    }
    const existingCount = action === "edit" ? 2 : 1;
    await expect(outcomes).toContainText(countText(existingCount));
    await expect(originalLine).toHaveCount(0);

    // The unresolved old request must reach the store and receive its terminal
    // conflict. Silently replaying the edited/deleted row is not a success.
    const conflict = page.waitForResponse(response => isLeadPost(response.url(), response.request().method()));
    await line.click();
    expect((await conflict).status()).toBe(409);
    await expect(page.getByRole("status").filter({ hasText: "この登録は処理済みです。最新の一覧を確認してください。" })).toBeVisible();
    await expect(outcomes).toContainText(countText(existingCount));
    expect(posts).toHaveLength(3);
    expect(posts[2].idempotencyKey).toBe(posts[0].idempotencyKey);
    expect(statuses).toEqual([503, 200, 409]);
    await page.screenshot({ path: testInfo.outputPath(`google-inquiry-${action}-conflict.png`), fullPage: true });
    // There is no automatic replacement POST after 409. Only the next manual +1
    // may use a fresh key, and the edited/deleted original stays unchanged.
    expect(posts).toHaveLength(3);
    await line.click();
    await expect(page.getByRole("status").filter({ hasText: "LINE経由の問い合わせを1件記録しました。" })).toBeVisible();
    await expect(outcomes).toContainText(countText(existingCount + 1));
    const breakdown = `LINE 1件 / 電話 1件 / Web ${action === "edit" ? 1 : 0}件 / その他 0件`;
    await expect(page.getByText(breakdown, { exact: true })).toBeVisible();
    expect(posts).toHaveLength(4);
    expect(posts[3].idempotencyKey).not.toBe(posts[0].idempotencyKey);
    expect(posts.map(post => post.channel)).toEqual(["line", "phone", "line", "line"]);
    expect(statuses).toEqual([503, 200, 409, 200]);
    await page.reload();
    await expect(outcomes).toContainText(countText(existingCount + 1));
    await expect(page.getByText(breakdown, { exact: true })).toBeVisible();
    expect(posts).toHaveLength(4);
    await page.screenshot({ path: testInfo.outputPath(`google-inquiry-${action}-recovered.png`), fullPage: true });
  });
}

test("uncertain inquiry retries survive other channels and school switches without duplicate counts", async ({ page, fixture }, testInfo) => {
  const requests: Array<{ schoolId: string; channel: string; idempotencyKey: string }> = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname !== "/api/dashboard/google-results" || request.method() !== "POST") return;
    const body = request.postDataJSON();
    requests.push({ schoolId: url.searchParams.get("schoolId") || "", channel: body.channel, idempotencyKey: body.idempotencyKey });
  });
  await page.goto("/dashboard/roi?schoolId=school-a");
  const outcomes = page.getByRole("region", { name: "実際の成果" });
  const countText = (count: number) => `期間内の問い合わせ ${count}件のうち、集計終了までに面談実施 0件・入塾 0件`;
  const line = page.getByRole("button", { name: "LINE +1", exact: true });
  const schools = page.getByRole("combobox", { name: "選択校舎" });
  await expect(outcomes).toContainText(countText(0));

  fixture.failNextLeadResponseAfterSave = true;
  await line.click();
  await expect(page.getByRole("status").filter({ hasText: "検証用の保存応答失敗" })).toHaveText("検証用の保存応答失敗");
  expect(fixture.failNextLeadResponseAfterSave).toBe(false);
  await expect(page.getByRole("status").filter({ hasText: "LINE経由の問い合わせを1件記録しました。" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("google-inquiry-response-lost.png"), fullPage: true });

  await page.getByRole("button", { name: "電話 +1", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "電話経由の問い合わせを1件記録しました。" })).toBeVisible();
  // The read after the phone save sees the earlier LINE record that was already
  // persisted by the fixture, despite its failed response.
  await expect(outcomes).toContainText(countText(2));
  await expect(page.getByText("LINE 1件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();

  // Header navigation retains the mounted component and its pending operations.
  // A full page.goto here would erase them and test a different boundary.
  await schools.selectOption("school-b");
  await expect(page).toHaveURL(/schoolId=school-b/);
  await expect(outcomes).toContainText(countText(0));
  await line.click();
  await expect(outcomes).toContainText(countText(1));
  await schools.selectOption("school-a");
  await expect(page).toHaveURL(/schoolId=school-a/);
  await expect(outcomes).toContainText(countText(2));

  await line.click();
  await expect(page.getByRole("status").filter({ hasText: "LINE経由の問い合わせを1件記録しました。" })).toBeVisible();
  await expect(outcomes).toContainText(countText(2));
  await expect(page.getByText("LINE 1件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(4);
  expect(requests[3].idempotencyKey).toBe(requests[0].idempotencyKey);
  expect(new Set(requests.slice(0, 3).map(request => request.idempotencyKey)).size).toBe(3);
  await page.screenshot({ path: testInfo.outputPath("google-inquiry-retry-deduplicated.png"), fullPage: true });

  // A confirmed success retires only that pending key; a deliberate next +1
  // creates another inquiry rather than replaying the now-completed one.
  await line.click();
  await expect(outcomes).toContainText(countText(3));
  await expect(page.getByText("LINE 2件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(5);
  expect(requests[4].idempotencyKey).not.toBe(requests[0].idempotencyKey);
  expect(requests.map(({ schoolId, channel }) => ({ schoolId, channel }))).toEqual([
    { schoolId: "school-a", channel: "line" },
    { schoolId: "school-a", channel: "phone" },
    { schoolId: "school-b", channel: "line" },
    { schoolId: "school-a", channel: "line" },
    { schoolId: "school-a", channel: "line" },
  ]);
  await page.reload();
  await expect(outcomes).toContainText(countText(3));
  await expect(page.getByText("LINE 2件 / 電話 1件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("google-inquiry-retry-reloaded.png"), fullPage: true });
  await schools.selectOption("school-b");
  await expect(outcomes).toContainText(countText(1));
  await page.reload();
  await expect(outcomes).toContainText(countText(1));
  await expect(page.getByText("LINE 1件 / 電話 0件 / Web 0件 / その他 0件", { exact: true })).toBeVisible();
  await schools.selectOption("school-a");
  await expect(outcomes).toContainText(countText(3));
  expect(requests).toHaveLength(5);
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
