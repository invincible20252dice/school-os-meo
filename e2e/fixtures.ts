import { test as base, expect, type Page } from "@playwright/test";
import { startChallenge, updateChallenge, weeklyActions } from "../src/lib/challenge";
import { snapshot } from "../src/test/challenge-fixtures";
import { buildEmptySchoolSetting } from "../src/lib/settings";
import type { AioViewData, MeasurementView } from "../src/lib/aio-view";

const origin = "http://127.0.0.1:4317";
const schools = [{ id: "school-a", name: "検証用A校" }, { id: "school-b", name: "検証用B校" }];
export type FixtureState = { failedSave: boolean; aioReadFailure: boolean; aioConfigured: boolean; aioFailure: boolean; aioCanMeasure: boolean; aioRecommended: boolean; aioCount: number; aioMixed: boolean; aioHistory: boolean; calls: Array<{ path: string; method: string; schoolId: string }>; unexpected: string[] };

async function install(page: Page): Promise<FixtureState> {
  const state: FixtureState = { failedSave: false, aioReadFailure: false, aioConfigured: true, aioFailure: false, aioCanMeasure: true, aioRecommended: false, aioCount: 1, aioMixed: false, aioHistory: false, calls: [], unexpected: [] };
  const measurements = new Map<string, MeasurementView>();
  const documents = new Map(schools.map(s => [s.id, { document: startChallenge(10, snapshot()), version: 1 }]));
  await page.addInitScript(() => {
    if (location.origin !== "http://127.0.0.1:4317") return;
    const key = "sb-127-auth-token";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      access_token: "e2e-only-session", refresh_token: "e2e-only-refresh", token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000,
      user: { id: "test-user", email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" },
    }));
  });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    // The login background is external in production; tests serve a local asset only.
    if (request.resourceType() === "image" && url.origin === "https://images.unsplash.com"
      && url.pathname === "/photo-1523050854058-8df90110c9f1") {
      return route.fulfill({ contentType: "image/png", path: "public/service-logo.png" });
    }
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json",
      headers: { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization,apikey,content-type,x-client-info", "access-control-allow-methods": "GET,POST,OPTIONS" },
      body: JSON.stringify(body) });
    if (url.origin === "http://127.0.0.1:54321") {
      if (request.method() === "OPTIONS") return json({});
      if (url.pathname === "/auth/v1/authorize") return route.fulfill({ contentType: "text/html", body: "<h1>Test OAuth destination</h1>" });
      if (url.pathname === "/auth/v1/user") return json({ id: "test-user", email: "fixture@example.invalid", user_metadata: {} });
      if (url.pathname === "/rest/v1/profiles") return json({ id: "test-user", role: "admin", status: "active", school_ids: schools.map(s => s.id), full_name: "検証担当" });
      state.unexpected.push(url.pathname);
      return route.abort();
    }
    if (url.origin !== origin) { state.unexpected.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const schoolId = url.searchParams.get("schoolId") || "school-a";
    state.calls.push({ path: url.pathname, method: request.method(), schoolId });
    if (url.pathname === "/api/auth/me") return json({ approved: true, status: "active", role: "admin" });
    if (url.pathname === "/api/dashboard/context") return json({ user: { name: "検証担当", role: "admin" }, schools, currentSchoolId: schoolId, currentSchoolName: schools.find(s => s.id === schoolId)?.name, canSwitchSchool: true });
    const school = schools.find(s => s.id === schoolId);
    if (!school) return json({ success: false, error: "校舎へのアクセス権限がありません。" }, 403);
    if (url.pathname === "/api/dashboard/challenge") {
      const record = documents.get(schoolId)!;
      if (request.method() === "POST") {
        if (state.failedSave) return json({ success: false, error: "テスト用保存エラー" }, 500);
        const command = request.postDataJSON();
        if (command.version !== record.version) return json({ success: false, error: "更新競合" }, 409);
        try { record.document = updateChallenge(record.document, command, snapshot(), "test-user"); record.version++; }
        catch { return json({ success: false, error: "実行記録を確認してください。" }, 400); }
      }
      return json({ success: true, school: { ...school, phoneNumber: null, addressLine: null, websiteUrl: null },
        ...record, snapshot: snapshot(), surveys: [], actions: weeklyActions(record.document, snapshot()) });
    }
    if (url.pathname === "/api/dashboard/aio") {
      if (state.aioReadFailure) return json({ success: false, code: "STORAGE_FAILED", error: "計測データを取得できませんでした。" }, 503);
      const canMeasure = state.aioCanMeasure && schoolId === "school-a";
      const keywords = Array.from({ length: state.aioCount }, (_, i) => ({ id: "keyword-" + schoolId + (i ? "-" + i : ""), keyword: ["地域 塾", "地域 大学受験 塾", "地域 高校生 塾", "地域 自習室 塾"][i] || "地域 塾 " + i, municipality: "検証市", nearestStation: "検証駅" }));
      if (request.method() === "POST") {
        if (!canMeasure) return json({ success: false, error: "計測権限がありません。" }, 403);
        const body = request.postDataJSON();
        const index = keywords.findIndex(k => k.id === body.keywordId);
        if (index < 0 || !body.requestId) return json({ success: false }, 400);
        const failed = state.aioFailure || (state.aioMixed && index === 3);
        const recommended = state.aioRecommended || (state.aioMixed && index === 1);
        if (!measurements.has(body.keywordId)) measurements.set(body.keywordId, {
          id: "measurement-" + body.keywordId, schoolName: "検証用A校", status: failed ? "FAILED" : "SUCCESS",
          query: "検証地域のおすすめの塾", response: failed ? null : recommended ? "検証用A校をおすすめします。" : state.aioCount > 1 ? "おすすめの学習塾です。\n1. **検証予備校**\n自習室で大学受験を支援します。" : "他の塾が候補です。",
          brandDetected: failed ? null : recommended, recommended: failed ? null : recommended,
          score: failed ? null : recommended ? 100 : 0, measuredAt: failed ? null : new Date().toISOString(),
          createdAt: new Date().toISOString(), model: "gpt-4.1-mini", errorCode: failed ? "QUOTA" : null,
          evidence: !failed && recommended ? "検証用A校をおすすめします。" : null, citations: [{ url: "https://example.org", title: "検証出典" }],
        });
      }
      const data: AioViewData = { configured: state.aioConfigured, canMeasure, pilotKeywordId: "keyword-school-a",
        keywords: keywords.map(k => { const latest = measurements.get(k.id) || null; return { ...k, latest, history: latest ? [latest, ...(state.aioHistory ? [{ ...latest, id: latest.id + "-prior", status: "SUCCESS", recommended: false, brandDetected: false, score: 0, createdAt: new Date(Date.parse(latest.createdAt) - 86400000).toISOString(), measuredAt: new Date(Date.parse(latest.createdAt) - 86400000).toISOString() }] : [])] : [] }; }) };
      return json({ success: true, ...data });
    }
    if (request.method() !== "GET") { state.unexpected.push(request.method() + " " + url.pathname); return route.abort(); }
    if (url.pathname === "/api/dashboard/reviews") return json({ success: true, reviews: [{
      id: "review-" + schoolId, schoolId, schoolName: school.name, source: "GOOGLE",
      authorName: school.name + "の保護者", parentName: "", rating: 5, originalText: "説明が丁寧でした。",
      status: "PENDING", aiReplyText: "", repliedAt: "", replyText: "", googleReviewManagementUrl: "",
    }] });
    if (url.pathname === "/api/surveys") return json({ surveys: [{
      id: "survey-" + schoolId, schoolId, schoolName: school.name, title: school.name + "アンケート",
      requiredKeywords: "", minCharCount: 100, maxCharCount: 300, isValid: true, hasIncentive: false, benefitType: "", updatedAt: "2026-10-01T00:00:00Z",
    }] });
    if (url.pathname === "/api/settings/google") return json({ school, setting: {
      ...buildEmptySchoolSetting(schoolId), googleConnected: schoolId === "school-a",
      googleAccountId: schoolId === "school-a" ? "fixture@example.invalid" : "",
    } });
    state.unexpected.push(request.method() + " " + url.pathname);
    return route.abort();
  });
  return state;
}

export const test = base.extend<{ fixture: FixtureState }>({
  fixture: [async ({ page }, use) => {
    const fixture = await install(page);
    await use(fixture);
    expect(fixture.unexpected, "No unmocked API or external request may escape the fixture").toEqual([]);
  }, { auto: true }],
});
export { expect };
