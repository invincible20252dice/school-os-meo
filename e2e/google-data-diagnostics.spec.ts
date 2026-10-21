import { test, expect } from "./fixtures";
import { snapshot } from "../src/test/challenge-fixtures";
import { startChallenge, weeklyActions, type Snapshot } from "../src/lib/challenge";

// Promote review-only same-school recovery to both standard browser projects.
for (const recoveredStatus of ["AVAILABLE", "EMPTY"] as const) {
  test(`same-school search demand recovers to ${recoveredStatus} in daily and weekly views`, async ({ page, fixture }, testInfo) => {
    let recovered = false;
    const document = startChallenge(10, snapshot());
    await page.route("**/api/dashboard/challenge?**", async route => {
      const request = route.request(), url = new URL(request.url());
      const schoolId = url.searchParams.get("schoolId") ?? "";
      fixture.calls.push({ path: url.pathname, method: request.method(), schoolId });
      expect(request.method()).toBe("GET");
      expect(schoolId).toBe("school-a");
      const current: Snapshot = { ...snapshot(),
        demandStatus: recovered ? recoveredStatus : "API_ERROR",
        demandStage: recovered ? "FETCHED" : "OAUTH", demandHttpStatus: recovered ? 200 : 400,
        demand: recovered && recoveredStatus === "EMPTY" ? [] : [{
          query: recovered ? "復帰済みの検索テーマ" : "過去の検索テーマ", month: "2026-09",
          impressions: 99, updatedAt: recovered ? "2026-10-09" : "2026-10-01",
        }],
      };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        success: true, school: { id: schoolId, name: "検証用A校", phoneNumber: null, addressLine: null, websiteUrl: null },
        document, version: 1, snapshot: current, surveys: [], actions: weeklyActions(document, current),
      }) });
    });
    const notice = page.getByRole("status", { name: "検索需要の取得状態" });
    await page.goto("/dashboard/challenge?schoolId=school-a&day=5");
    await expect(notice).toContainText("HTTP 400");
    await expect(page.getByText(/過去の検索テーマ/)).toHaveCount(0);
    const dailyNotice = await notice.textContent();
    await page.getByRole("main").getByRole("link", { name: "今週のアクション", exact: true }).click();
    const panel = page.getByRole("region", { name: "校舎別NEXT ACTION" });
    await expect(notice).toHaveText(dailyNotice!);
    await expect(panel.getByText("判定根拠：手動テーマ")).toBeVisible();
    await expect(page.getByText(/過去の検索テーマ/)).toHaveCount(0);
    await expect(page.getByText(/正常に取得しました.*0件/)).toHaveCount(0);

    recovered = true;
    await page.reload();
    await expect(notice).toHaveCount(0);
    await expect(page.getByText(/過去の検索テーマ/)).toHaveCount(0);
    if (recoveredStatus === "AVAILABLE") {
      await expect(panel.getByRole("heading", { name: "復帰済みの検索テーマに応える投稿を作る" })).toBeVisible();
      await expect(panel.getByText("判定根拠：手動テーマ")).toHaveCount(0);
      await panel.getByRole("heading", { name: "復帰済みの検索テーマに応える投稿を作る" }).scrollIntoViewIfNeeded();
    } else {
      await expect(panel.getByText("Googleから正常に取得しましたが、対象月の検索語句は0件です。", { exact: true })).toBeVisible();
      await expect(panel.getByText("判定根拠：手動テーマ")).toBeVisible();
      await expect(page.getByText(/復帰済みの検索テーマ/)).toHaveCount(0);
      await panel.getByText("Googleから正常に取得しましたが、対象月の検索語句は0件です。", { exact: true }).scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: testInfo.outputPath(`same-school-${recoveredStatus}-weekly.png`), fullPage: false });
    await page.goto("/dashboard/challenge?schoolId=school-a&day=5");
    await page.reload();
    await expect(notice).toHaveCount(0);
    await expect(page.getByText(/過去の検索テーマ/)).toHaveCount(0);
    // The daily guide is the daily consumer of the recovered search-demand snapshot.
    const daily = page.getByRole("region", { name: "DAY5詳細", exact: true });
    await daily.getByText("やり方・お手本を見る", { exact: false }).click();
    if (recoveredStatus === "AVAILABLE") {
      await expect(daily.getByRole("button", { name: /復帰済みの検索テーマ/ })).toBeVisible();
      await daily.getByRole("button", { name: /復帰済みの検索テーマ/ }).scrollIntoViewIfNeeded();
    } else {
      await expect(daily.getByText("Googleから正常に取得しましたが、対象月の検索語句は0件です。", { exact: true })).toBeVisible();
      await expect(daily.getByRole("button", { name: /このテーマを使う/ })).toHaveCount(0);
      await daily.getByText("Googleから正常に取得しましたが、対象月の検索語句は0件です。", { exact: true }).scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: testInfo.outputPath(`same-school-${recoveredStatus}-daily.png`), fullPage: false });
    const challengeCalls = fixture.calls.filter(c => c.path === "/api/dashboard/challenge");
    expect(challengeCalls.length).toBeGreaterThanOrEqual(5);
    expect(challengeCalls.every(c => c.schoolId === "school-a" && c.method === "GET")).toBe(true);
    expect(fixture.calls.filter(c => c.method !== "GET")).toEqual([]);
  });
}

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
