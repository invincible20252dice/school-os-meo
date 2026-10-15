import { test as base, expect, type Page } from "@playwright/test";
import { startChallenge, updateChallenge, weeklyActions } from "../src/lib/challenge";
import { snapshot } from "../src/test/challenge-fixtures";
import { buildEmptySchoolSetting } from "../src/lib/settings";
import type { AioViewData, MeasurementView } from "../src/lib/aio-view";
import { aggregateLeads, LeadError, leadPeriod, parseLeadEdit, type LeadFact } from "../src/lib/google-leads";
import { parseLeadOperationKey, validateLeadCreateKey, validateLeadOperationKey } from "../src/lib/google-lead-operation-key";
import { advanceLeadStage, aggregateLeadLifecycle } from "../src/lib/google-lead-lifecycle";

export const syntheticUserId = "11111111-1111-4111-8111-111111111111";
export const secondSyntheticUserId = "22222222-2222-4222-8222-222222222222";
const origin = "http://127.0.0.1:4317";
const schools = [{ id: "school-a", name: "検証用A校" }, { id: "school-b", name: "検証用B校" }];
type SyntheticLeadRow = LeadFact & { id: string; idempotencyKey: string; version: number; grade: null };
type SyntheticLeadPost = { requestNumber: number; schoolId: string; channel: string; idempotencyKey: string };
type SyntheticLeadEvent = {
  sequence: number;
  kind: "post-received" | "post-committed" | "post-replayed" | "post-response" | "post-cancelled-before-commit" | "get-response" | "status-response";
  schoolId: string;
  rowCount: number;
  requestNumber?: number;
  channel?: string;
  idempotencyKey?: string;
  rowId?: string;
  status?: number;
  operationState?: string;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

// Node-side test state, independent of browser document lifetimes. The same
// instance can also be supplied to installFixture for additional test pages.
export function createSyntheticLeadServer() {
  const rows = new Map<string, SyntheticLeadRow[]>(schools.map(school => [school.id, []]));
  const events: SyntheticLeadEvent[] = [];
  let requestCount = 0;
  type CommitBarrier = {
    received: ReturnType<typeof deferred<SyntheticLeadPost>>;
    decision: ReturnType<typeof deferred<"cancel" | "commit">>;
    completed: ReturnType<typeof deferred<void>>;
  };
  let nextCommitBarrier: CommitBarrier | null = null;
  const count = (schoolId: string) => (rows.get(schoolId) ?? []).filter(row => !row.deletedAt).length;
  const record = (kind: SyntheticLeadEvent["kind"], schoolId: string,
    details: Omit<Partial<SyntheticLeadEvent>, "sequence" | "kind" | "schoolId" | "rowCount"> = {}) => {
    events.push({ ...details, sequence: events.length + 1, kind, schoolId, rowCount: count(schoolId) });
  };
  return {
    rows, events, count, record,
    receivePost(schoolId: string, body: { channel: string; idempotencyKey: string }): SyntheticLeadPost {
      const post = { requestNumber: ++requestCount, schoolId, channel: body.channel, idempotencyKey: body.idempotencyKey };
      record("post-received", schoolId, post);
      return post;
    },
    blockNextPostBeforeCommit() {
      if (nextCommitBarrier) throw new Error("A synthetic before-commit barrier is already pending.");
      const barrier: CommitBarrier = { received: deferred<SyntheticLeadPost>(), decision: deferred<"cancel" | "commit">(), completed: deferred<void>() };
      nextCommitBarrier = barrier;
      return {
        received: barrier.received.promise,
        cancelled: barrier.completed.promise,
        cancel: () => barrier.decision.resolve("cancel"),
        commit: () => barrier.decision.resolve("commit"),
      };
    },
    async cancelBeforeCommitIfBlocked(post: SyntheticLeadPost) {
      const barrier = nextCommitBarrier;
      if (!barrier) return false;
      nextCommitBarrier = null;
      barrier.received.resolve(post);
      if (await barrier.decision.promise === "commit") { barrier.completed.resolve(); return false; }
      // This terminates the synthetic server operation before any insertion.
      // Browser request abortion alone never supplies this guarantee.
      record("post-cancelled-before-commit", post.schoolId, post);
      barrier.completed.resolve();
      return true;
    },
  };
}

export type FixtureState = { leadServer: ReturnType<typeof createSyntheticLeadServer>; userId: string; failLeadStatus: boolean; unknownNextLeadConflict: boolean; failNextLeadResponseAfterSave: boolean; failNextLeadRead: boolean; failedSave: boolean; aioReadFailure: boolean; aioConfigured: boolean; aioFailure: boolean; aioCanMeasure: boolean; aioRecommended: boolean; aioCount: number; aioMixed: boolean; aioHistory: boolean; calls: Array<{ path: string; method: string; schoolId: string }>; unexpected: string[] };

export async function installFixture(page: Page, leadServer = createSyntheticLeadServer(), options: { seedSession?: boolean; role?: "admin" | "manager" } = {}): Promise<FixtureState> {
  const state: FixtureState = { leadServer, userId: syntheticUserId, failLeadStatus: false, unknownNextLeadConflict: false, failNextLeadResponseAfterSave: false, failNextLeadRead: false, failedSave: false, aioReadFailure: false, aioConfigured: true, aioFailure: false, aioCanMeasure: true, aioRecommended: false, aioCount: 1, aioMixed: false, aioHistory: false, calls: [], unexpected: [] };
  const leads = leadServer.rows;
  const measurements = new Map<string, MeasurementView>();
  const documents = new Map(schools.map(s => [s.id, { document: startChallenge(10, snapshot()), version: 1 }]));
  if (options.seedSession !== false) await page.addInitScript(() => {
    if (location.origin !== "http://127.0.0.1:4317") return;
    const key = "sb-127-auth-token";
    if (sessionStorage.getItem("fixture-auth-seeded")) return;
    sessionStorage.setItem("fixture-auth-seeded", "1");
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({
      access_token: "e2e-only-session", refresh_token: "e2e-only-refresh", token_type: "bearer",
      expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000,
      user: { id: "11111111-1111-4111-8111-111111111111", email: "fixture@example.invalid", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" },
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
      if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": origin } });
      if (url.pathname === "/auth/v1/user") return json({ id: state.userId, email: "fixture@example.invalid", user_metadata: {} });
      if (url.pathname === "/rest/v1/profiles") return json({ id: state.userId, role: options.role ?? "admin", status: "active", school_ids: schools.map(s => s.id), full_name: "検証担当" });
      state.unexpected.push(url.pathname);
      return route.abort();
    }
    if (url.origin !== origin) { state.unexpected.push(url.origin + url.pathname); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const schoolId = url.searchParams.get("schoolId") || "school-a";
    state.calls.push({ path: url.pathname, method: request.method(), schoolId });
    if (url.pathname === "/api/auth/me") return json({ approved: true, status: "active", role: options.role ?? "admin" });
    if (url.pathname === "/api/dashboard/context") return json({ user: { name: "検証担当", role: options.role ?? "admin" }, schools, currentSchoolId: schoolId, currentSchoolName: schools.find(s => s.id === schoolId)?.name, canSwitchSchool: true });
    const school = schools.find(s => s.id === schoolId);
    if (!school) return json({ success: false, error: "校舎へのアクセス権限がありません。" }, 403);
    if (url.pathname === "/api/dashboard/google-results/performance") return json({ success: true, data: { state: "unavailable", websiteClicks: null, phoneClicks: null, updatedAt: null, measuredDays: 0 } });
    if (url.pathname === "/api/dashboard/google-results/operation-status") {
      const operationId = url.searchParams.get("operationId") || "";
      try { validateLeadOperationKey(operationId, state.userId); }
      catch (error) { return json({ success: false, error: "登録操作を確認できません。" }, error instanceof LeadError ? error.status : 400); }
      if (state.failLeadStatus) {
        leadServer.record("status-response", schoolId, { idempotencyKey: operationId, status: 503 });
        return json({ success: false, error: "検証用の状態確認失敗" }, 503);
      }
      const row = leads.get(schoolId)!.find(value => value.idempotencyKey === operationId);
      const operationState = !row ? "absent" : row.deletedAt ? "deleted" : (row.version > 1 || row.channel !== parseLeadOperationKey(operationId)!.channel) ? "changed" : "saved";
      leadServer.record("status-response", schoolId, { idempotencyKey: operationId, status: 200, operationState });
      return json({ success: true, state: operationState });
    }
    if (url.pathname === "/api/dashboard/google-results") {
      const rows = leads.get(schoolId)!;
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        const post = leadServer.receivePost(schoolId, body);
        try { validateLeadCreateKey(body.idempotencyKey, state.userId, body.channel); }
        catch (error) { return json({ success: false, error: "登録操作を確認できません。" }, error instanceof LeadError ? error.status : 400); }
        if (state.unknownNextLeadConflict) {
          state.unknownNextLeadConflict = false;
          leadServer.record("post-response", schoolId, { ...post, status: 409 });
          return json({ success: false, error: "検証用の未確認競合" }, 409);
        }
        if (await leadServer.cancelBeforeCommitIfBlocked(post)) return route.abort("failed");
        let row = rows.find(r => r.idempotencyKey === body.idempotencyKey);
        if (!row) {
          row = { id: `lead-${schoolId}-${rows.length}`, idempotencyKey: body.idempotencyKey, version: 1, grade: null, source: "google", status: "inquiry", channel: body.channel, occurredAt: new Date(), meetingAt: null, deletedAt: null };
          rows.push(row);
          leadServer.record("post-committed", schoolId, { ...post, rowId: row.id });
        } else leadServer.record("post-replayed", schoolId, { ...post, rowId: row.id });
        if (row.channel !== body.channel || row.deletedAt) {
          leadServer.record("post-response", schoolId, { ...post, status: 409 });
          return json({ success: false, error: "この登録は処理済みです。最新の一覧を確認してください。" }, 409);
        }
        // The record is retained even though its acknowledgement cannot reach
        // the client. Retrying must reuse the original scoped idempotency key.
        if (state.failNextLeadResponseAfterSave) {
          state.failNextLeadResponseAfterSave = false;
          leadServer.record("post-response", schoolId, { ...post, status: 503 });
          return json({ success: false, error: "検証用の保存応答失敗" }, 503);
        }
        leadServer.record("post-response", schoolId, { ...post, status: 200 });
        const { idempotencyKey: _privateKey, ...publicLead } = row;
        return json({ success: true, lead: publicLead });
      }
      if (request.method() === "PATCH" || request.method() === "DELETE") {
        const body = request.postDataJSON(), row = rows.find(r => r.id === body.id && !r.deletedAt);
        if (!row) return json({ success: false, error: "対象の記録が見つかりません。" }, 404);
        if (row.version !== body.version) return json({ success: false, error: "更新競合" }, 409);
        if (request.method() === "DELETE") row.deletedAt = new Date();
        else {
          const hasMetadata = ["channel", "grade", "status", "occurredAt"].some(field => body[field] !== undefined);
          try {
            Object.assign(row, {
              ...(hasMetadata || body.stage === undefined ? parseLeadEdit(body, new Date()) : {}),
              ...(body.stage === undefined ? {} : advanceLeadStage(row, body.stage, new Date())),
            });
          } catch (error) {
            return json({ success: false, error: error instanceof Error ? error.message : "変更内容を確認してください。" }, error instanceof LeadError ? error.status : 400);
          }
          row.meetingAt = row.status === "meeting" ? row.meetingAt ?? new Date() : null;
        }
        row.version++;
        return json({ success: true, id: row.id });
      }
      if (request.method() === "GET") {
        if (state.failNextLeadRead) {
          state.failNextLeadRead = false;
          leadServer.record("get-response", schoolId, { status: 503 });
          return json({ success: false, error: "検証用の再取得失敗" }, 503);
        }
        const period = leadPeriod(url.searchParams.get("period") || "month", new Date(Date.now() + 1));
        leadServer.record("get-response", schoolId, { status: 200 });
        return json({ success: true, school, period: { name: period.period, from: period.from, to: period.to }, ...aggregateLeads(rows, period), lifecycle: aggregateLeadLifecycle(rows, period), recent: rows.filter(r => !r.deletedAt && r.occurredAt >= period.from && r.occurredAt < period.to).slice(-20).reverse().map(({ idempotencyKey: _privateKey, ...row }) => row) });
      }
    }
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
    const fixture = await installFixture(page);
    await use(fixture);
    expect(fixture.unexpected, "No unmocked API or external request may escape the fixture").toEqual([]);
  }, { auto: true }],
});
export { expect };
