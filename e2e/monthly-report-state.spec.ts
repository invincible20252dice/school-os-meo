import type { Route } from "@playwright/test";
import { test, expect } from "./fixtures";

const report = (schoolName: string, score: number) => ({
  schoolName, period: "2026年8月度", score, rank: "C", monthOverMonth: "比較未取得",
  aiComment: "検証用に取得したコメント",
  metrics: [{ label: "口コミ", value: "0件", detail: "検証用の取得値", trend: "", tone: "watch" }],
  actions: [{ title: "検証用の改善提案", detail: "検証用の詳細", owner: "担当" }],
});

test("report loading, error, missing and zero recovery stay truthful", async ({ page }, testInfo) => {
  const requests: Route[] = [];
  await page.route("**/api/dashboard/reports?**", route => { requests.push(route); });
  const respond = async (index: number, body: unknown, status = 200) => {
    await expect.poll(() => requests.length).toBe(index + 1);
    expect(requests[index].request().method()).toBe("GET");
    await requests[index].fulfill({ status, json: body });
  };
  const neutral = async () => {
    await expect(page.getByRole("img", { name: /総合評価/ })).toHaveCount(0);
    await expect(page.getByText(/青葉ゼミナール|88\/100点|A判定/)).toHaveCount(0);
    await expect(page.getByText("改善提案・アクションプラン")).toHaveCount(0);
    await expect(page.getByText("比較データは未取得です。")).toBeVisible();
    await expect(page.getByLabel("インサイト比較期間")).toHaveCount(0);
  };
  await page.goto("/dashboard/report?schoolId=school-a&month=2026-08");
  await expect(page.getByRole("status")).toContainText("取得しています");
  await neutral();
  await page.screenshot({ path: testInfo.outputPath("report-loading.png"), fullPage: true });
  await respond(0, { success: false }, 503);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("取得できませんでした");
  await neutral();
  await page.screenshot({ path: testInfo.outputPath("report-error.png"), fullPage: true });
  await page.getByLabel("対象期間", { exact: true }).selectOption("2026-07");
  await respond(1, { success: true, report: null });
  await expect(page.getByText("この校舎・対象期間のレポートは未取得です。")).toBeVisible();
  await neutral();
  await page.screenshot({ path: testInfo.outputPath("report-missing.png"), fullPage: true });
  await page.getByLabel("対象期間", { exact: true }).selectOption("2026-08");
  await respond(2, { success: true, report: { ...report("検証用A校", 0), period: "2026年7月度" } });
  await expect(page.getByRole("img", { name: "総合評価 0点" })).toBeVisible();
  await expect(page.getByText("0/100点", { exact: true })).toBeVisible();
  await expect(page.getByText("0件", { exact: true })).toBeVisible();
  await expect(page.getByLabel("対象期間", { exact: true })).toHaveValue("2026-08");
  await expect(page.getByText("レポート対象期間: 2026年7月度")).toBeVisible();
  await expect(page.getByText("比較データは未取得です。")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("report-zero.png"), fullPage: true });
});

test("report school and month switches hide stale values until the scoped response arrives", async ({ page }, testInfo) => {
  const requests: Route[] = [];
  await page.route("**/api/dashboard/reports?**", route => { requests.push(route); });
  await page.goto("/dashboard/report?schoolId=school-a&month=2026-08");
  await expect.poll(() => requests.length).toBe(1);
  await requests[0].fulfill({ json: { success: true, report: report("検証用A校", 42) } });
  await expect(page.getByRole("img", { name: "総合評価 42点" })).toBeVisible();
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect.poll(() => requests.length).toBe(2);
  expect(new URL(requests[1].request().url()).searchParams.get("schoolId")).toBe("school-b");
  await expect(page.getByRole("img", { name: /総合評価/ })).toHaveCount(0);
  await expect(page.getByText(/検証用A校 の/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("report-school-switch.png"), fullPage: true });
  await requests[1].fulfill({ json: { success: true, report: report("検証用B校", 17) } });
  await expect(page.getByRole("img", { name: "総合評価 17点" })).toBeVisible();
  await page.getByLabel("対象期間", { exact: true }).selectOption("2026-07");
  await expect.poll(() => requests.length).toBe(3);
  const url = new URL(requests[2].request().url());
  expect(url.searchParams.get("schoolId")).toBe("school-b");
  expect(url.searchParams.get("month")).toBe("2026-07");
  await expect(page.getByRole("img", { name: /総合評価/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("report-month-switch.png"), fullPage: true });
  await requests[2].fulfill({ json: { success: true, report: { ...report("検証用B校", 0), period: "2026年7月度" } } });
  await expect(page.getByRole("img", { name: "総合評価 0点" })).toBeVisible();
  expect(requests.every(route => route.request().method() === "GET")).toBe(true);
});
