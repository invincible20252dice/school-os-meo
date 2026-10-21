import { test, expect } from "./fixtures";
import { buildDashboardOverview } from "../src/lib/dashboard-summary";
import { buildDashboardRankingData } from "../src/lib/dashboard-rankings";

for (const linkName of ["順位を確認", "「B校 個別指導」の最新順位と競合状況を確認してください。"]) {
  test(`all-school overview retains measured school when opening ${linkName}`, async ({ page, fixture }, testInfo) => {
    const now = new Date("2026-10-21T00:00:00Z");
    await page.route("**/api/dashboard/overview?**", async route => {
      expect(new URL(route.request().url()).searchParams.get("schoolId")).toBe("all");
      await route.fulfill({ json: { success: true, schoolId: null, schoolName: "全校舎", schoolCount: 2, generatedAt: now.toISOString(), summary: buildDashboardOverview({ reviews: [], queries: [], alerts: [], keywords: [{ id: "k-b", schoolId: "school-b", keyword: "B校 個別指導", rankHistories: [{ rank: 8, checkedAt: now }], aioScoreHistories: [] }] }, now) } });
    });
    await page.route("**/api/dashboard/keywords/ranking?**", async route => {
      const url = new URL(route.request().url());
      const schoolId = url.searchParams.get("schoolId")!;
      fixture.calls.push({ path: url.pathname, method: route.request().method(), schoolId });
      expect(schoolId).toBe("school-b");
      await route.fulfill({ json: { success: true, ...buildDashboardRankingData({ school: { id: "school-b", name: "検証用B校" }, keywords: [] }) } });
    });
    await page.goto("/dashboard?schoolId=all");
    await expect(page.getByText("全校舎（2校舎）", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "口コミを確認", exact: true })).toHaveAttribute("href", "/dashboard/reviews?schoolId=all");
    await page.getByRole("link", { name: linkName, exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/rankings\?schoolId=school-b$/);
    await expect(page.getByText(/データ取得完了/)).toBeVisible();
    expect(fixture.calls.filter(c => c.path === "/api/dashboard/keywords/ranking").map(c => c.schoolId)).toEqual(["school-b"]);
    await page.screenshot({ path: testInfo.outputPath("ranking-school-context.png"), fullPage: true });
  });
}
