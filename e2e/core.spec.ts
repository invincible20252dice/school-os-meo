import { test, expect } from "./fixtures";

test("Google login starts OAuth with local callback only", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "ログイン", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Google/ }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:54321\/auth\/v1\/authorize/);
  const url = new URL(page.url());
  expect(url.searchParams.get("provider")).toBe("google");
  expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:4317/auth/callback");
});

test("challenge execution record survives reload and stays isolated across schools", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/challenge?schoolId=school-a&day=1");
  await expect(page.getByRole("heading", { name: "7日間チャレンジ", exact: true })).toBeVisible();
  await page.getByText("メモを追加する（任意）", { exact: true }).click();
  await page.getByRole("textbox", { name: "実行記録・残課題の理由", exact: true }).fill("A校の実行記録");
  await page.getByRole("button", { name: "実行記録を保存", exact: true }).click();
  await expect(page.getByText("実行記録を保存しました。", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByText("メモを確認・編集", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "実行記録・残課題の理由", exact: true })).toHaveValue("A校の実行記録");
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(page).toHaveURL(/schoolId=school-b/);
  await page.getByText("メモを追加する（任意）", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "実行記録・残課題の理由", exact: true })).toHaveValue("");
  expect(fixture.calls.filter(c => c.method === "POST").map(c => c.schoolId)).toEqual(["school-a"]);
  await page.screenshot({ path: testInfo.outputPath("challenge.png"), fullPage: true });
});

test("failed save keeps the draft and does not persist a false success", async ({ page, fixture }) => {
  await page.goto("/dashboard/challenge?schoolId=school-a&day=1");
  await page.getByText("メモを追加する（任意）", { exact: true }).click();
  await page.getByRole("textbox", { name: "実行記録・残課題の理由", exact: true }).fill("保存失敗の記録");
  fixture.failedSave = true;
  await page.getByRole("button", { name: "実行記録を保存", exact: true }).click();
  await expect(page.getByText("テスト用保存エラー", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "実行記録・残課題の理由", exact: true })).toHaveValue("保存失敗の記録");
  await page.reload();
  await page.getByText("メモを追加する（任意）", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "実行記録・残課題の理由", exact: true })).toHaveValue("");
});

test("review and survey lists follow the selected school", async ({ page }) => {
  await page.goto("/dashboard/reviews?schoolId=school-a");
  await expect(page.getByText("検証用A校の保護者", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(page.getByText("検証用B校の保護者", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("検証用A校の保護者", { exact: true })).toHaveCount(0);
  await page.goto("/dashboard/surveys?schoolId=school-b");
  await expect(page.getByText("検証用B校アンケート", { exact: true })).toBeVisible();
});

test("Google connection state follows the selected school without contacting Google", async ({ page }) => {
  await page.goto("/dashboard/settings/google?schoolId=school-a");
  await expect(page.getByText("連携済み", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(page.getByText("未連携", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("連携済み", { exact: true })).toHaveCount(0);
});

test("unknown school is rejected by the fixture and UI shows the refusal", async ({ page }) => {
  await page.goto("/dashboard/challenge?schoolId=school-unknown");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("校舎へのアクセス権限がありません。");
});

test("AIO database failure must not display successful zero metrics", async ({ page, fixture }) => {
  fixture.aioReadFailure = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByRole("heading", { name: "AIOスコア分析", exact: true })).toBeVisible();
  await expect(page.getByText("0/100", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("計測データを取得できませんでした。");
});

test("AIO manual result survives reload and stays isolated from another school", async ({ page, fixture }, testInfo) => {
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByText("未計測", { exact: true })).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "1件を計測" }).click();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await expect(page.getByText("他の塾が候補です。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1件を計測" })).toBeDisabled();
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/aio" && c.method === "POST")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("aio-result.png"), fullPage: true });
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(page.getByText("未計測", { exact: true })).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "1件を計測" })).toBeDisabled();
});

test("AIO quota failure is not successful zero", async ({ page, fixture }) => {
  fixture.aioFailure = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await page.getByRole("button", { name: "1件を計測" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("計測失敗");
  await expect(page.getByText("0%", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("計測失敗");
  await expect(page.getByRole("button", { name: "1件を計測" })).toBeDisabled();
});

test("AIO recommendation is 1/1 and remains visible after reload", async ({ page, fixture }) => {
  fixture.aioRecommended = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await page.getByRole("button", { name: "1件を計測" }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("選択キーワード：推奨 1件 / 計測成功 1件", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1件を計測" })).toBeDisabled();
});

test("AIO read-only members cannot initiate a measurement", async ({ page, fixture }) => {
  fixture.aioCanMeasure = false;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByText("未計測", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1件を計測" })).toBeDisabled();
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/aio" && c.method === "POST")).toHaveLength(0);
});

test("AIO missing API settings disable measurement", async ({ page, fixture }) => {
  fixture.aioConfigured = false;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByText("設定が必要", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1件を計測" })).toBeDisabled();
});
