import { test, expect } from "./fixtures";

test("failed search demand remains unknown across reload and never leaks into another school's recommendations", async ({ page, fixture }, testInfo) => {
  fixture.demandFailure = true;
  await page.goto("/dashboard/challenge?schoolId=school-a&day=5");
  await expect(page.getByRole("status", { name: "検索需要の取得状態" })).toContainText("HTTP 400");
  await page.getByRole("main").getByRole("link", { name: "今週のアクション", exact: true }).click();
  const panel = page.getByRole("region", { name: "校舎別NEXT ACTION" });
  await expect(panel.getByRole("status", { name: "検索需要の取得状態" })).toBeVisible();
  await expect(panel.getByRole("status", { name: "検索需要の取得状態" })).toContainText("情報不足のため未判定");
  await expect(panel.getByText("判定根拠：手動テーマ")).toBeVisible();
  await expect(panel.getByRole("heading", { name: "検証用の検索テーマに応える投稿を作る" })).toHaveCount(0);
  await expect(panel.getByText(/正常に取得しました.*0件/)).toHaveCount(0);
  await panel.getByRole("listitem").filter({ hasText: "教室の学習支援を伝える投稿テーマを選ぶ" }).getByText("やり方・お手本を見る", { exact: false }).click();
  await expect(panel.getByRole("button", { name: /このテーマを使う/ })).toHaveCount(0);
  await panel.getByRole("status", { name: "検索需要の取得状態" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("search-demand-failure.png"), fullPage: false });
  await page.reload();
  await expect(panel.getByRole("status", { name: "検索需要の取得状態" })).toBeVisible();
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(panel.getByRole("heading", { name: "検証用の検索テーマに応える投稿を作る" })).toBeVisible();
  await expect(panel.getByText(/HTTP 400/)).toHaveCount(0);
  expect(fixture.calls.filter(c => c.method !== "GET")).toEqual([]);
});
