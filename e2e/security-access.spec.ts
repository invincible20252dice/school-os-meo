import { test, expect } from "./fixtures";
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
