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
  await page.getByRole("button", { name: "このキーワードを計測" }).click();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("0%", { exact: true })).toBeVisible();
  await page.getByText("AI回答を見る", { exact: true }).click();
  await expect(page.getByText("他の塾が候補です。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このキーワードを計測" })).toBeEnabled();
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/aio" && c.method === "POST")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (testInfo.project.name === "mobile") {
    const menu = await page.getByRole("button", { name: "メニュー", exact: true }).boundingBox();
    const school = await page.getByRole("combobox", { name: "選択校舎" }).boundingBox();
    expect(menu).not.toBeNull();
    expect(school).not.toBeNull();
    expect(school!.x).toBeGreaterThanOrEqual(menu!.x + menu!.width + 8);
  }
  await page.screenshot({ path: testInfo.outputPath("aio-result.png"), fullPage: true });
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(page.getByText("未計測", { exact: true })).toBeVisible();
  await expect(page.getByText("0%", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "このキーワードを計測" })).toBeDisabled();
});

test("AIO quota failure is not successful zero", async ({ page, fixture }) => {
  fixture.aioFailure = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await page.getByRole("button", { name: "このキーワードを計測" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("計測失敗");
  await expect(page.getByText("0%", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("計測失敗");
  await expect(page.getByRole("button", { name: "このキーワードを計測" })).toBeEnabled();
});

test("AIO recommendation is 1/1 and remains visible after reload", async ({ page, fixture }) => {
  fixture.aioRecommended = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await page.getByRole("button", { name: "このキーワードを計測" }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("1 / 1成功計測で推奨", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このキーワードを計測" })).toBeEnabled();
});

test("AIO read-only members cannot initiate a measurement", async ({ page, fixture }) => {
  fixture.aioCanMeasure = false;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByText("未計測", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このキーワードを計測" })).toBeDisabled();
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/aio" && c.method === "POST")).toHaveLength(0);
});

test("AIO missing API settings disable measurement", async ({ page, fixture }) => {
  fixture.aioConfigured = false;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByText("設定が必要", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このキーワードを計測" })).toBeDisabled();
});

test("AIO four-keyword mixed batch shows 33%, evidence, actions and persists on reload", async ({ page, fixture }, testInfo) => {
  fixture.aioCount = 4; fixture.aioMixed = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await expect(page.getByText("登録 4件", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "OpenAIで4件を計測" }).click();
  await expect(page.getByText("33%", { exact: true })).toBeVisible();
  await expect(page.getByText("1 / 3成功計測で推奨", { exact: true })).toBeVisible();
  await expect(page.getByText("計測失敗 1件", { exact: true })).toBeVisible();
  await expect(page.getByText("計測状態を更新しました。", { exact: false })).toBeVisible();
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/aio" && c.method === "POST")).toHaveLength(4);
  await expect(page.locator("summary").filter({ hasText: "検証予備校" })).toBeVisible();
  await expect(page.getByRole("region", { name: "今週やること" }).getByRole("heading", { name: "自習の写真を撮る" })).toHaveCount(1);
  await expect(page.getByTestId("aio-school-actions").locator(":scope > li")).toHaveCount(3);
  await expect(page.getByText(/比較データ未取得。/)).toBeVisible();
  await expect(page.getByText("AI回答を見る", { exact: true }).locator("..")).not.toHaveAttribute("open", "");
  await expect(page.getByRole("img", { name: "日別OpenAI推奨率の推移" }).locator("circle")).toHaveCount(1);
  await page.reload();
  await expect(page.getByText("33%", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "登録キーワード" }).selectOption("keyword-school-a-3");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("計測失敗（QUOTA）");
  await page.getByRole("combobox", { name: "登録キーワード" }).selectOption("keyword-school-a");
  await page.getByTestId("aio-school-actions").locator("li").filter({ has: page.getByRole("heading", { name: "自習の写真を撮る", exact: true }) }).getByText("やり方・お手本を見る", { exact: false }).click();
  await expect(page.getByAltText("自習写真の撮影お手本（AI生成）")).toBeVisible();
  await expect.poll(() => page.getByAltText("自習写真の撮影お手本（AI生成）").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("aio-phase2-mixed.png"), fullPage: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("aio-phase2-viewport.png") });
});

test("AIO Google fixture comparison, seven-day exclusions and historical evidence survive reload without extra calls", async ({ page, fixture }, testInfo) => {
  fixture.aioCount = 4; fixture.aioComparison = true; fixture.aioHistory = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await page.getByRole("button", { name: "OpenAIで4件を計測" }).click();
  await expect(page.getByText("0 / 4成功計測で推奨", { exact: true })).toBeVisible();
  const table = page.getByRole("table", { name: "Google保存データの中央値比較" });
  await expect(table.getByRole("row").filter({ hasText: "口コミ数" })).toContainText("3件31件1店舗");
  await expect(table.getByRole("row").filter({ hasText: "写真数" })).toContainText("10枚41枚1店舗");
  await expect(table.getByRole("row").filter({ hasText: "口コミ返信率" })).toContainText("未取得未取得0店舗");
  await expect(page.getByTestId("aio-school-actions").locator(":scope > li")).toHaveCount(3);
  await expect(page.getByTestId("aio-school-actions")).toContainText("口コミ数は自塾3件");
  await page.locator("summary").filter({ hasText: "検証予備校" }).click();
  await expect(page.getByText(/^取得元：google-business-profile/)).toBeVisible();
  await page.reload();
  await expect(table.getByRole("row").filter({ hasText: "口コミ数" })).toContainText("3件31件1店舗");
  await page.getByText("選択キーワードの履歴", { exact: true }).click();
  await page.getByRole("button", { name: "保存回答を開く" }).last().click();
  await expect(page.getByRole("article", { name: "過去の保存回答" })).toContainText("検証予備校");
  expect(fixture.calls.filter(c => c.path === "/api/dashboard/aio" && c.method === "POST")).toHaveLength(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("aio-phase3-comparison.png"), fullPage: true });
  fixture.aioRecentRequest = true;
  await page.reload();
  await expect(page.getByText("0 / 4成功計測で推奨", { exact: true })).toBeVisible();
  await expect(page.getByTestId("aio-school-actions")).not.toContainText("口コミ数は自塾3件");
  await page.getByRole("combobox", { name: "選択校舎" }).selectOption("school-b");
  await expect(page.getByText("未計測", { exact: true })).toBeVisible();
  await expect(page.getByTestId("aio-school-actions").locator(":scope > li")).toHaveCount(0);
});

test("AIO four successful recommended keywords have no forced NEXT ACTION", async ({ page, fixture }, testInfo) => {
  fixture.aioCount = 4; fixture.aioRecommended = true; fixture.aioHistory = true;
  await page.goto("/dashboard/aio?schoolId=school-a");
  await page.getByRole("button", { name: "OpenAIで4件を計測" }).click();
  await expect(page.getByText("4 / 4成功計測で推奨", { exact: true })).toBeVisible();
  await expect(page.getByText("現在、OpenAI検索回答では登録キーワードすべてで推奨されています。", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "改善を始める" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "日別OpenAI推奨率の推移" }).locator("circle")).toHaveCount(2);
  await page.reload();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("aio-phase2-all-recommended.png"), fullPage: true });
});
