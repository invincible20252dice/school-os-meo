import { expect, it } from "vitest";
import { compareAioPlaces, matchAioPlace, median, readPlaceSnapshots, readActionHistory } from "./aio-comparison";

const now = "2026-10-10T00:00:00Z";
const school = { name: "自校塾", googlePlaceId: "own", prefecture: "熊本県", city: "熊本市", addressLine: "中央区1-1" };
const place = (name = "A予備校", id = "a", count = 30) => ({ name, placeId: id, address: "熊本県熊本市中央区1-1", rating: 4.5, reviewCount: count });
const saved = (places: unknown[]) => readPlaceSnapshots([{ checkedAt: new Date(now), competitorData: { source: "google-places", retentionUntil: "2026-10-11T00:00:00Z", places } }], now);
const candidate = { name: "A予備校", evidence: "1. **A予備校**\n熊本市で個別指導をします。" };
const keyword = (id = "k", response = "おすすめの予備校です。\n1. **A予備校**\n熊本市で個別指導をします。") => ({ id, keyword: "熊本 塾", municipality: "熊本市", latest: { status: "SUCCESS", recommended: false, brandDetected: false, score: 0, measuredAt: now, createdAt: now, response, schoolName: "自校塾" } });

it("accepts only source-bearing unexpired snapshots, never legacy or simulated numbers", () => {
  expect(readPlaceSnapshots([{ checkedAt: new Date(now), competitorData: [place()] }], now)).toEqual([]);
  for (const source of ["SIMULATION", "unknown", ""]) expect(readPlaceSnapshots([{ checkedAt: new Date(now), competitorData: { source, retentionUntil: "2026-10-11", places: [place()] } }], now)).toEqual([]);
  for (const until of ["2026-10-09", "bad", null]) expect(readPlaceSnapshots([{ checkedAt: new Date(now), competitorData: { source: "google-places", retentionUntil: until, places: [place()] } }], now)).toEqual([]);
  expect(saved([place()])[0]).toMatchObject({ placeId: "a", reviewCount: 30, source: "google-places" });
  expect(saved([place(), { ...place(), reviewCount: -1, rating: 20, placeId: "bad" }])[1]).toMatchObject({ reviewCount: null, rating: null });
});
it("matches name, branch and region; address strengthens confidence but conflicts never auto-match", () => {
  const places = saved([place()]);
  expect(matchAioPlace(candidate, places, school.city)).toMatchObject({ confidence: "MEDIUM", place: { placeId: "a" } });
  expect(matchAioPlace({ ...candidate, evidence: "_熊本県熊本市中央区1-1_\n個別指導" }, places, school.city)).toMatchObject({ confidence: "HIGH" });
  expect(matchAioPlace({ ...candidate, evidence: "_熊本県熊本市中央区9-9_" }, places, school.city).place).toBeNull();
  expect(matchAioPlace(candidate, places, "福岡市").place).toBeNull();
  expect(matchAioPlace(candidate, saved([place(), place("A予備校", "other")]), school.city).place).toBeNull();
  expect(matchAioPlace({ name: "A予備校別校", evidence: "" }, places, school.city).place).toBeNull();
  expect(matchAioPlace(candidate, [], school.city).confidence).toBe("NONE");
});
it("normalizes width and kana readings without merging different branches", () => {
  expect(matchAioPlace({ name: "壺溪塾（こけいじゅく）坪井本校", evidence: "" }, saved([place("壺渓塾 坪井本校")]), school.city).confidence).toBe("MEDIUM");
  expect(matchAioPlace({ name: "Ａ予備校", evidence: "" }, saved([place()]), school.city).confidence).toBe("MEDIUM");
});
it("calculates medians from available values and does not treat absence as zero", () => {
  expect(median([0, 10, 20, 1000])).toBe(15);
  expect(median([null, 3, 100, 5])).toBe(5);
  expect(median([null, NaN, Infinity])).toBeNull();
  const result = compareAioPlaces({ school, keywords: [keyword()], places: saved([place(), place("自校塾", "own", 3)]), history: readActionHistory(null), now });
  expect(result.metrics.find(m => m.key === "reviewCount")).toMatchObject({ own: 3, median: 30, sampleSize: 1, gap: 27 });
  expect(result.metrics.find(m => m.key === "photoCount")).toMatchObject({ own: null, median: null });
  expect(result.actions[0]).toMatchObject({ key: "request-reviews", basis: "Google保存データ", fact: expect.stringContaining("3") });
  expect(result.actions.length).toBeLessThanOrEqual(3);
});
it("does not derive photo totals, latest posts or reply rates from Places' partial lists", () => {
  const row = saved([{ ...place(), photos: [{ name: "photo" }], photoCount: 20, replyRate: 80, lastPostAt: now, services: ["個別指導"] }])[0];
  expect(row).toMatchObject({ photoCount: null, replyRate: null, postAge: null, services: null });
});
it("deduplicates school-wide actions and suppresses recently completed keys and DAY3/4 requests", () => {
  const history = readActionHistory({ schemaVersion: 1, missions: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, status: i === 2 ? "COMPLETED" : "NOT_STARTED", completedAt: i === 2 ? now : null })), nextActionHistory: [{ key: "check-1-description", day: 1, status: "COMPLETED", completedAt: now }] });
  const result = compareAioPlaces({ school, keywords: [keyword(), keyword("k2")], places: saved([place(), place("自校塾", "own", 3)]), history, now });
  expect(result.actions.map(a => a.key)).not.toContain("request-reviews");
  expect(result.actions.map(a => a.key)).not.toContain("check-1-description");
  expect(new Set(result.actions.map(a => a.key)).size).toBe(result.actions.length);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0].keywordIds).toEqual(["k", "k2"]);
});
it("keeps unavailable comparison and answer-only advice explicit; failed AIO yields no actions", () => {
  const result = compareAioPlaces({ school, keywords: [keyword()], places: [], history: readActionHistory(null), now });
  expect(result.status).toBe("UNAVAILABLE");
  expect(result.actions.every(a => a.basis === "OpenAI回答のみ")).toBe(true);
  expect(result.metrics.every(m => m.own === null && m.median === null)).toBe(true);
  expect(compareAioPlaces({ school, keywords: [{ ...keyword(), latest: { ...keyword().latest, status: "FAILED" } }], places: [], history: readActionHistory(null), now }).actions).toEqual([]);
  expect(compareAioPlaces({ school, keywords: [keyword()], places: [], history: readActionHistory({ bad: true }), now }).actions).toEqual([]);
});

const history = (records: unknown[] = [], day = 0, completedAt = now) => readActionHistory({ schemaVersion: 1,
  missions: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, completedAt: i + 1 === day ? completedAt : null })), nextActionHistory: records });
const run = (places = saved([place(), place("自校塾", "own", 3)]), h = history(), keywords = [keyword()]) => compareAioPlaces({ school, keywords, places, history: h, now });
const managed = (rows: unknown[]) => readPlaceSnapshots([{ checkedAt: new Date(now), competitorData: { source: "google-business-profile", retentionUntil: "2026-10-11", places: rows } }], now);

it("uses only complete managed metrics for photos, replies, recency and service facts", () => {
  const result = run(managed([
    { ...place(), photosComplete: true, photoCount: 40, reviewsComplete: true, replyRate: 90, latestReviewAt: "2026-10-09", postsComplete: true, lastPostAt: "2026-10-08", servicesComplete: true, services: ["大学受験", "", 123], category: "学習塾", websiteAvailable: true },
    { ...place("自校塾", "own", 0), photosComplete: true, photoCount: 0, reviewsComplete: true, replyRate: 0, latestReviewAt: "2026-09-10", postsComplete: true, lastPostAt: "2026-09-10", servicesComplete: true, services: [], websiteAvailable: false },
  ]));
  expect(result.metrics.find(m => m.key === "photoCount")).toMatchObject({ own: 0, median: 40, gap: 40 });
  expect(result.metrics.find(m => m.key === "replyRate")).toMatchObject({ own: 0, median: 90 });
  expect(result.metrics.find(m => m.key === "reviewAge")).toMatchObject({ own: 30, median: 1 });
  expect(result.metrics.find(m => m.key === "postAge")).toMatchObject({ own: 30, median: 2 });
  expect(result.actions.map(a => a.key)).toEqual(["pending-replies", "check-7-contact", "request-reviews"]);
  const suppressed = history(["pending-replies", "check-7-contact", "request-reviews"].map(key => ({ key, day: 4, status: "IN_PROGRESS" })));
  expect(run([result.own!, result.candidates[0].place!], suppressed).actions.map(a => a.key)).toEqual(["publish-manual", "check-2-photo4", "check-1-description"]);
  expect(result.candidates[0].place?.services).toEqual(["大学受験"]);
});
it("rejects stale, future, malformed and simulated snapshots and uses the newest eligible observation", () => {
  const snapshot = (at: string, count = 30) => ({ checkedAt: new Date(at), competitorData: { source: "google-places", retentionUntil: "2026-10-11", places: [place("A予備校", "a", count)] } });
  expect(readPlaceSnapshots([snapshot("2026-10-03"), snapshot("2026-10-11"), snapshot("invalid")], now)).toEqual([]);
  expect(readPlaceSnapshots([snapshot("2026-10-08", 20), snapshot(now, 30)], now)[0].reviewCount).toBe(30);
  expect(saved([null, {}, place("A予備校", "mock-a"), place("", "empty"), { ...place(), address: "" }])).toEqual([]);
  const rows = saved([place()]); rows[0].retentionUntil = "2026-10-09";
  expect(run(rows).matched).toBe(0);
  expect(managed([{ ...place(), photosComplete: true, photoCount: 1.2, reviewsComplete: true, replyRate: -1, latestReviewAt: "future", postsComplete: true, lastPostAt: "2026-11-01" }])[0]).toMatchObject({ photoCount: null, replyRate: null, reviewAge: null, postAge: null, services: null });
});
it("caps each keyword at three and the school at five, with no extra Google requests", () => {
  const response = (offset: number) => "おすすめの塾です。\n" + Array.from({ length: 4 }, (_, i) => `${i + 1}. **競合${i + offset}予備校**\n個別指導です。`).join("\n");
  const result = run([], history(), [keyword("k1", response(0)), keyword("k2", response(4)), keyword("k3", response(8)), keyword("k4", response(12))]);
  expect(result.candidates).toHaveLength(5); expect(result.omitted).toBe(7);
  expect(result.candidates.map(c => c.name)).not.toContain("競合3予備校");
  expect(result.actions.length).toBeLessThanOrEqual(3);
  expect(run([], history(), [keyword("k", "他の候補を確認してください。")]).candidates).toEqual([]);
});
it("never combines conflicting addresses from multiple answers or misidentifies the own school", () => {
  const response = (address: string) => `おすすめの塾です。\n1. **A予備校**\n_${address}_\n個別指導です。`;
  const result = run(saved([place(), place("自校塾", "own")]), history(), [keyword("a", response("熊本県熊本市中央区1-1")), keyword("b", response("熊本県熊本市中央区9-9"))]);
  expect(result.candidates[0]).toMatchObject({ confidence: "LOW", place: null });
  expect(result.matched).toBe(0);
  expect(run(saved([place(), { ...place("自校塾", "own"), address: "福岡県福岡市1" }])).own).toBeNull();
  expect(compareAioPlaces({ school: { name: "自校塾" }, keywords: [keyword()], places: [], history: history(), now }).candidates).toHaveLength(1);
});
it("does not propose actions for successful recommended answers or incomplete success records", () => {
  for (const latest of [{ ...keyword().latest, recommended: true }, { ...keyword().latest, measuredAt: null }, { ...keyword().latest, score: null }, { ...keyword().latest, recommended: null }, null]) {
    expect(run([], history(), [{ ...keyword(), latest } as ReturnType<typeof keyword>]).actions).toEqual([]);
  }
});
it("shares seven-day exclusions and ongoing states, then reopens after seven days", () => {
  for (const status of ["IN_PROGRESS", "WAITING", "DEFERRED", "COMPLETED"]) {
    expect(run(undefined, history([{ key: "request-reviews", day: 3, status, completedAt: now }])).actions.map(a => a.key)).not.toContain("request-reviews");
  }
  for (const day of [3, 4]) expect(run(undefined, history([], day)).actions.map(a => a.key)).not.toContain("request-reviews");
  expect(run(undefined, history([], 3, "2026-10-03T00:00:00Z")).actions.map(a => a.key)).toContain("request-reviews");
  const postHistory = history([{ key: "publish-other", day: 5, status: "COMPLETED", completedAt: now }]);
  expect(run(undefined, postHistory).actions.map(a => a.key)).not.toContain("publish-manual");
  expect(run(undefined, history([], 1)).actions.map(a => a.key)).not.toContain("check-1-description");
});
it("projects only execution state and fails closed on malformed history", () => {
  expect(readActionHistory(undefined).status).toBe("UNAVAILABLE");
  expect(readActionHistory(null).status).toBe("AVAILABLE");
  const doc = { schemaVersion: 1, missions: history().document.missions, nextActionHistory: [{ key: "action", day: 1, status: "WAITING", actorId: "private", note: "private" }] };
  expect(JSON.stringify(readActionHistory(doc))).not.toContain("private");
  for (const bad of [{ ...doc, schemaVersion: 2 }, { ...doc, missions: [] }, { ...doc, nextActionHistory: "bad" }, { ...doc, nextActionHistory: [{ key: "x", day: 1, status: "COMPLETED", completedAt: null }] }, { ...doc, missions: doc.missions.map(m => ({ ...m, completedAt: "invalid" })) }]) expect(readActionHistory(bad).status).toBe("UNAVAILABLE");
});
