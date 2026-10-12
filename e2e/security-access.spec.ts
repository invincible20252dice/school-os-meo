import { test, expect } from "./fixtures";
import { buildMockInstagramSyncPreview, DEFAULT_INSTAGRAM_LOCATION } from "../src/lib/mock-instagram-sync";

test("LINE settings use authenticated school read and save across reload without sending notifications", async ({ page }, testInfo) => {
  let destination = "synthetic-original-destination";
  const calls: string[] = [];
  const setting = () => ({ schoolId: "school-a", lineChannelAccessToken: "synthetic-local-token",
    lineDestinationId: destination, lineNotifyEnabled: true, notifyOnNewReview: true, notifyOnLowRating: false });
  await page.route("**/api/dashboard/settings/line?**", async route => {
    expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
    expect(new URL(route.request().url()).searchParams.get("schoolId")).toBe("school-a");
    calls.push("GET");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ school: { id: "school-a" }, setting: setting() }) });
  });
  await page.route("**/api/settings/school", async route => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
    expect(route.request().postDataJSON()).toMatchObject({ schoolId: "school-a", lineChannelAccessToken: "synthetic-local-token",
      lineChannelAccessTokenTouched: false, lineDestinationIdTouched: true, lineDestinationId: "synthetic-updated-destination" });
    destination = "synthetic-updated-destination";
    calls.push("PATCH");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ school: { id: "school-a" }, setting: setting() }) });
  });
  await page.goto("/dashboard/settings/line?schoolId=school-a");
  await expect(page.getByLabel("チャネルアクセストークン", { exact: true })).toHaveValue("synthetic-local-token");
  await page.getByLabel("送信先グループID / ユーザーID", { exact: true }).fill("synthetic-updated-destination");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(page.getByText("校舎設定を保存しました。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("送信先グループID / ユーザーID", { exact: true })).toHaveValue(destination);
  expect(calls).toEqual(["GET", "PATCH", "GET"]);
  await page.screenshot({ path: testInfo.outputPath("school-line-settings-reload.png"), fullPage: true });
});
test("alert UI sends bearer and selected school for read/update without provider calls", async({page},testInfo)=>{
 let status="OPEN";
 const requests:Array<{method:string;school:string|null}>=[];
 await page.route("**/api/dashboard/churn-alert?**",async route=>{
  const request=route.request();
  expect(request.headers().authorization).toBe("Bearer e2e-only-session");
  const school=new URL(request.url()).searchParams.get("schoolId");
  expect(school).toBe("school-a");
  requests.push({method:request.method(),school});
  if(request.method()==="PATCH") {expect(request.postDataJSON()).toMatchObject({alertId:"security-alert-a",status:"IN_PROGRESS"});status="IN_PROGRESS";}
  const alert={id:"security-alert-a",schoolId:"school-a",source:"SURVEY",guardianSegment:"合成保護者",studentGrade:"高2",rating:2,riskLevel:"HIGH",category:"合成確認",status,rawStatus:status,statusLabel:status==="OPEN"?"未対応":"対応中",reason:"検証用",aiActionProposal:"手動確認",assignedTo:"",createdAt:"2026-10-10T00:00:00Z"};
  await route.fulfill({contentType:"application/json",body:JSON.stringify({success:true,alerts:[alert],alert})});
 });
 await page.goto("/dashboard/reviews/alerts?schoolId=school-a");
 await expect(page.getByText("合成保護者",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"対応中",exact:true}).click();
 await expect(page.getByRole("button",{name:"対応中",exact:true})).toBeDisabled();
 await page.reload();
 await expect(page.getByRole("button",{name:"対応中",exact:true})).toBeDisabled();
 expect(requests.map(r=>r.method)).toEqual(["GET","PATCH","GET"]);
 await page.screenshot({path:testInfo.outputPath("security-alert-bearer.png"),fullPage:true});
});

test("Instagram settings keep bearer authentication and never preload a real secret", async({page})=>{
 const calls:string[]=[];
 await page.route("**/api/dashboard/settings/instagram**",async route=>{
  const request=route.request();expect(request.headers().authorization).toBe("Bearer e2e-only-session");calls.push(request.method());
  if(request.method()==="POST") expect(request.postDataJSON()).toMatchObject({schoolId:"school-a",metaAppSecret:"********"});
  await route.fulfill({contentType:"application/json",body:JSON.stringify({success:true,school:{id:"school-a",name:"検証用A校"},setting:{schoolId:"school-a",instagramMetaAppId:"fixture-app",instagramMetaAppSecret:"********",instagramConnected:false}})});
 });
 await page.goto("/dashboard/settings/instagram?schoolId=school-a");
 await expect(page.getByLabel("Meta App Secret",{exact:true})).toHaveValue("********");
 await page.getByRole("button",{name:"設定を保存",exact:true}).click();
 await expect(page.getByText("校舎設定を保存しました。",{exact:true})).toBeVisible();
 expect(calls).toEqual(["GET","POST"]);
});

test("manual GBP selection sends bearer and school without external sync",async({page})=>{
 let saved=false;
 await page.route("**/api/google/gbp-location-selection",async route=>{
  expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
  expect(route.request().postDataJSON()).toMatchObject({schoolId:"school-a",selectedGbpLocationId:"locations/123"});saved=true;
  await route.fulfill({contentType:"application/json",body:JSON.stringify({school:{id:"school-a",name:"検証用A校",gbpLocationId:"locations/123"},setting:{schoolId:"school-a",googleConnected:true,selectedGbpLocationId:"locations/123",googleRefreshToken:"********"},account:{schoolId:"school-a",locationId:"locations/123",status:"CONNECTED"}})});
 });
 await page.goto("/dashboard/settings?schoolId=school-a");
 await page.getByLabel(/またはGBPロケーションIDを手動入力/).fill("123");
 await page.getByRole("button",{name:"手動入力した店舗IDを保存",exact:true}).click();
 await expect(page.getByText("手動入力したGBP店舗IDを保存しました。",{exact:true})).toBeVisible();
 expect(saved).toBe(true);
});

test("Google settings send bearer for selection save and preserve the masked result on reload", async ({ page }, testInfo) => {
  let location = "";
  const methods: string[] = [];
  await page.route("**/api/settings/google?**", async route => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer e2e-only-session");
    expect(new URL(request.url()).searchParams.get("schoolId")).toBe("school-a");
    methods.push(request.method());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      school: { id: "school-a", name: "検証用A校" },
      setting: { schoolId: "school-a", googleConnected: true, googleAccountId: "fixture@example.invalid",
        googleRefreshToken: "********", selectedGbpLocationId: location },
    }) });
  });
  await page.route("**/api/google/gbp-locations?**", async route => {
    expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ locations: [{
      name: "locations/fixture-123", title: "検証用A店舗", accountName: "accounts/fixture",
      accountDisplayName: "検証用アカウント", address: "検証用住所",
    }] }) });
  });
  await page.route("**/api/settings/google", async route => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
    expect(route.request().postDataJSON()).toEqual({ schoolId: "school-a", accountName: "accounts/fixture", locationName: "locations/fixture-123" });
    methods.push("POST");
    location = "locations/fixture-123";
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true,
      setting: { schoolId: "school-a", googleConnected: true, googleAccountId: "fixture@example.invalid",
        googleRefreshToken: "********", selectedGbpLocationId: location },
    }) });
  });
  await page.goto("/dashboard/settings/google?schoolId=school-a");
  await expect(page.getByText("fixture@example.invalid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "GBP店舗一覧を取得", exact: true }).click();
  await page.getByRole("button", { name: "選択したGBP店舗を保存", exact: true }).click();
  await expect(page.getByText("GBP店舗の紐付けを保存しました。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(location, { exact: true })).toBeVisible();
  expect(methods).toEqual(["GET", "POST", "GET"]);
  await page.screenshot({ path: testInfo.outputPath("google-settings-save-reload.png"), fullPage: true });
});

test("notification test sends bearer and selected school with unsaved input, using only mocks", async ({ page }, testInfo) => {
  const calls: string[] = [];
  await page.route("**/api/dashboard/settings/line**", async route => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ setting: {
      schoolId: "school-b", lineNotifyEnabled: true, lineChannelAccessToken: "stored-synthetic", lineDestinationId: "stored-destination",
    } }) });
  });
  await page.route("**/api/test/trigger-review", async route => {
    const request = route.request();
    expect(request.headers().authorization).toBe("Bearer e2e-only-session");
    expect(request.postDataJSON()).toEqual({ schoolId: "school-b", lineChannelAccessToken: "unsaved-synthetic-token", lineDestinationId: "unsaved-synthetic-destination" });
    calls.push(request.method());
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, saved: true, notified: true, message: "合成テスト完了（実通知なし）" }) });
  });
  await page.goto("/dashboard/settings/line?schoolId=school-b");
  await expect(page.getByLabel("チャネルアクセストークン", { exact: true })).toHaveValue("stored-synthetic");
  await page.getByLabel("チャネルアクセストークン", { exact: true }).fill("unsaved-synthetic-token");
  await page.getByLabel("送信先グループID / ユーザーID", { exact: true }).fill("unsaved-synthetic-destination");
  await page.getByRole("button", { name: "テスト通知を送信", exact: true }).click();
  await expect(page.getByText("合成テスト完了（実通知なし）", { exact: true })).toBeVisible();
  expect(calls).toEqual(["POST"]);
  await page.screenshot({ path: testInfo.outputPath("notification-auth.png"), fullPage: true });
});

for (const schoolId of ["school-b", "all"]) {
  test(`manual Instagram sync sends bearer and scope ${schoolId} without provider calls`, async ({ page }, testInfo) => {
    const calls: string[] = [];
    await page.route("**/api/instagram/preview?**", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "プレビューを表示する校舎を選択してください。" }) }));
    await page.route("**/api/instagram/sync?**", async route => {
      const request = route.request();
      expect(request.method()).toBe("POST");
      expect(request.headers().authorization).toBe("Bearer e2e-only-session");
      expect(new URL(request.url()).searchParams.get("schoolId")).toBe(schoolId);
      calls.push(request.method());
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, message: "合成同期完了（実投稿なし）", summary: { settings: schoolId === "all" ? 2 : 1, posted: 0 } }) });
    });
    await page.goto(`/dashboard/instagram-sync?schoolId=${schoolId}`);
    await page.getByRole("button", { name: "実際のInstagramから投稿を取得してGBP連携を実行", exact: true }).click();
    await expect(page.getByText("実投稿はありません（0件）。", { exact: true })).toBeVisible();
    expect(calls).toEqual(["POST"]);
    await page.screenshot({ path: testInfo.outputPath(`instagram-auth-${schoolId}.png`), fullPage: true });
  });
}

for (const status of [200, 403]) {
  test(`Instagram preview uses authenticated selected school and handles ${status} without providers`, async ({ page }, testInfo) => {
    const preview = await buildMockInstagramSyncPreview({ school: { id: "school-b", name: "検証用B校プレビュー", gbpLocationId: "locations/synthetic" } });
    await page.route("**/api/instagram/preview?**", async route => {
      expect(route.request().method()).toBe("GET");
      expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
      expect(new URL(route.request().url()).searchParams.get("schoolId")).toBe("school-b");
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status === 200 ? {
        dashboardData: { location: DEFAULT_INSTAGRAM_LOCATION, instagramSetting: null }, preview,
      } : { message: "この校舎のプレビューは表示できません。" }) });
    });
    await page.goto("/dashboard/instagram-sync?schoolId=school-b");
    if (status === 200) await expect(page.getByText("検証用B校プレビュー", { exact: true })).toBeVisible();
    else {
      await expect(page.getByText("この校舎のプレビューは表示できません。", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "GBP投稿Payload", exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: testInfo.outputPath(`instagram-preview-${status}.png`), fullPage: true });
  });
}

test("manual sync shows unavailable without claiming success or exposing diagnostics", async ({ page }, testInfo) => {
  let calls = 0;
  await page.route("**/api/instagram/preview?**", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "プレビューを表示する校舎を選択してください。" }) }));
  await page.route("**/api/instagram/sync?**", async route => {
    expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
    expect(new URL(route.request().url()).searchParams.get("schoolId")).toBe("school-b");
    calls++;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({
      ok: false, code: "SYNC_UNAVAILABLE", message: "同期利用不可。設定を確認してから再度お試しください。",
    }) });
  });
  await page.goto("/dashboard/instagram-sync?schoolId=school-b");
  await page.getByRole("button", { name: "実際のInstagramから投稿を取得してGBP連携を実行", exact: true }).click();
  await expect(page.getByText("同期利用不可。設定を確認してから再度お試しください。", { exact: true })).toBeVisible();
  await expect(page.getByText(/SYNC_UNAVAILABLE|Instagram実同期を実行しました/)).toHaveCount(0);
  expect(calls).toBe(1);
  await page.screenshot({ path: testInfo.outputPath("instagram-sync-unavailable.png"), fullPage: true });
});

test("legacy-schema preview shows unavailable timestamp without claiming a real sync", async ({ page }, testInfo) => {
  const preview = await buildMockInstagramSyncPreview({ school: { id: "school-b", name: "検証用B校プレビュー", gbpLocationId: "" } });
  const syncCalls: string[] = [];
  await page.route("**/api/instagram/sync**", async route => {
    syncCalls.push(route.request().method());
    await route.abort();
  });
  await page.route("**/api/instagram/preview?**", async route => {
    expect(route.request().headers().authorization).toBe("Bearer e2e-only-session");
    expect(new URL(route.request().url()).searchParams.get("schoolId")).toBe("school-b");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({
      dashboardData: { location: DEFAULT_INSTAGRAM_LOCATION, instagramSetting: null, syncTimestampUnavailable: true }, preview,
    }) });
  });
  await page.goto("/dashboard/instagram-sync?schoolId=school-b");
  await expect(page.getByText("最終同期日時を取得できません（サンプル表示）", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ローカル整形サンプル", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("最終同期日時を取得できません（サンプル表示）", { exact: true })).toBeVisible();
  expect(syncCalls).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("instagram-preview-legacy-schema.png"), fullPage: true });
});
