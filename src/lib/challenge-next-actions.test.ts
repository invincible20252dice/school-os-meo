import { describe, expect, it } from "vitest";
import { challengeDocument, snapshot, completeCommand } from "@/test/challenge-fixtures";
import { nextActions, reconcileActionHistory, reviewRequestRecommendation, updateNextAction } from "./challenge-next-actions";
import { updateChallenge } from "./challenge";
import { challengeProgress } from "./challenge-progress";

describe("data-grounded recommendations", () => {
  it("keeps failed, absent, and healthy measurements distinct", () => {
    const s = snapshot();
    s.reviews = null;
    expect(reviewRequestRecommendation(s).count).toBeNull();
    s.reviews = snapshot().reviews;
    s.comparisons = null;
    expect(reviewRequestRecommendation(s).count).toBeNull();
    s.comparisons = [];
    expect(reviewRequestRecommendation(s).count).toBeNull();
    s.latestReviewAt = "2026-08-01";
    expect(reviewRequestRecommendation(s).count).toBe(5);
    s.comparisons = snapshot().comparisons;
    s.reviews!.count = 20;
    s.latestReviewAt = s.at;
    expect(reviewRequestRecommendation(s).count).toBe(0);
  });
  it("uses median from the latest measurement, ignores unavailable or invalid counts", () => {
    const s = snapshot();
    s.comparisons![0].competitors = [0, 30, 50, 20, null, -1].map((reviewCount, i) => ({ name: `${i}`, reviewCount, rating: null }));
    expect(reviewRequestRecommendation(s)).toMatchObject({ count: 10, reason: expect.stringContaining("中央値は25件") });
    s.comparisons!.push({ id: "new", keyword: "new", at: "2026-10-02", competitors: [{ name: "A", reviewCount: 5, rating: 4 }] });
    expect(reviewRequestRecommendation(s).count).toBe(5);
    s.comparisons![1].competitors[0].reviewCount = null;
    expect(reviewRequestRecommendation(s).count).toBeNull();
  });
  it.each([29, 30, 31])("uses the documented 30-day freshness boundary (%i)", days => {
    const s = snapshot(); s.reviews!.count = 12;
    s.latestReviewAt = new Date(Date.parse(s.at) - days * 86400000).toISOString();
    expect(reviewRequestRecommendation(s).count).toBe(days < 30 ? 0 : 5);
  });
  it("prioritizes actual unanswered reviews and manual critical checks, caps each day at three", () => {
    const s = snapshot(); s.google = false;
    const doc = challengeDocument();
    doc.missions[0].evidence.website = "確認済み";
    doc.missions[1].evidence.photo0 = "後で対応";
    const plan = nextActions(doc, s);
    expect(plan.top?.key).toBe("google-connect");
    expect(plan.days.every(d => d.actions.length <= 3)).toBe(true);
    expect(plan.available.some(a => a.key === "check-1-website")).toBe(false);
    expect(plan.days[3].actions[0]).toMatchObject({ key: "pending-replies", priority: "S" });
    expect(plan.available.find(a => a.key === "check-2-photo0")?.source).toBe("手動確認");
    const keys = plan.available.map(a => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter(k => k === "request-reviews")).toHaveLength(1);
  });
  it("does not fabricate extra work when all manual categories are good", () => {
    const doc = challengeDocument();
    for (const day of [1, 2, 7]) doc.missions[day - 1].evidence = completeCommand(day).evidence;
    const s = snapshot(); s.reviews!.pending = 0; s.reviews!.count = 20; s.latestReviewAt = s.at;
    const plan = nextActions(doc, s);
    expect(plan.days[0].actions).toEqual([]);
    expect(plan.days[1].actions).toEqual([]);
    expect(plan.days[6].actions).toEqual([]);
    expect(plan.available.some(a => ["pending-replies", "request-reviews"].includes(a.key))).toBe(false);
  });
  it.each([null, []])("distinguishes unavailable/empty comparison and demand", value => {
    const s = snapshot(); s.comparisons = value; s.demand = value; s.reviews = null;
    const plan = nextActions(challengeDocument(), s);
    expect(plan.days[4].actions[0]).toMatchObject({ key: "publish-manual", source: "手動テーマ", reason: expect.stringContaining(value === null ? "失敗" : "ありません") });
    expect(plan.days[5].actions[0].reason).toContain(value === null ? "取得できません" : "未判定");
  });
  it("uses only positive demand and connected Instagram for the real publishing workflow", () => {
    const s = snapshot(); s.instagram = true;
    s.demand = ["自習", "受験", "面談", "追加", "ゼロ"].map((query, i) => ({ query, month: "2026-09", impressions: i === 4 ? 0 : 30, updatedAt: s.at }));
    const actions = nextActions(challengeDocument(), s).days[4].actions;
    expect(actions).toHaveLength(3);
    expect(actions.every(a => a.path === "/dashboard/instagram" && a.source === "保存済みデータ")).toBe(true);
    expect(actions[0].reason).toContain("2026-09");
    s.instagram = false;
    expect(nextActions(challengeDocument(), s).days[4].actions[0].path).toBe("/dashboard/settings/google");
    s.demand = []; s.instagram = true;
    expect(nextActions(challengeDocument(), s).days[4].actions[0].path).toBe("/dashboard/instagram");
  });
});

describe("persistent actions and cooldown", () => {
  const command = (key: string, status = "IN_PROGRESS", note = "") => ({ action: "next-action", key, status, note });
  it("records server-owned proposal/evidence, changes states and preserves clear history", () => {
    const s = snapshot(); const doc = challengeDocument();
    doc.missions[0].status = "COMPLETED"; doc.missions[0].completedAt = s.at;
    let saved = updateNextAction(doc, { ...command("request-reviews"), reason: "forged", actorId: "forged" }, s, "user");
    expect(doc.nextActionHistory).toBeUndefined();
    const original = saved.nextActionHistory![0];
    expect(original).toMatchObject({ actorId: "user", proposedAt: s.at, startedAt: s.at, completedAt: null });
    expect(original.reason).not.toBe("forged");
    for (const status of ["DEFERRED", "WAITING", "IN_PROGRESS", "COMPLETED"]) saved = updateNextAction(saved, command("request-reviews", status, "実行根拠"), s, "user2");
    expect(saved.nextActionHistory).toHaveLength(1);
    expect(saved.nextActionHistory![0]).toMatchObject({ status: "COMPLETED", completedAt: s.at, actorId: "user2", startedAt: original.startedAt });
    expect(saved.missions[0]).toEqual(doc.missions[0]);
    expect(nextActions(saved, s).available.some(a => a.key === "request-reviews")).toBe(false);
    const future = { ...s, at: "2026-10-09T09:00:00Z" };
    saved = updateNextAction(saved, command("request-reviews"), future, "user");
    expect(saved.nextActionHistory).toHaveLength(2);
    expect(nextActions(saved, future).active).toHaveLength(1);
  });
  it("retains deferred/awaiting work even if the original signal disappears", () => {
    const s = snapshot();
    let doc = updateNextAction(challengeDocument(), command("pending-replies"), s, "u");
    doc = updateNextAction(doc, command("pending-replies", "DEFERRED", "明日確認"), s, "u");
    s.reviews = null;
    expect(nextActions(doc, s).active[0].status).toBe("DEFERRED");
    expect(nextActions(doc, s).available.some(a => a.key === "pending-replies")).toBe(false);
    doc = updateNextAction(doc, command("pending-replies", "COMPLETED", "Google上で確認"), s, "u");
    expect(nextActions(doc, s).active).toHaveLength(0);
  });
  it("suppresses cross-day request duplication and completed publications/improvements for seven days", () => {
    const doc = challengeDocument(); const s = snapshot();
    for (const day of [3, 4, 5, 6]) { doc.missions[day - 1].completedAt = s.at; doc.missions[day - 1].status = "COMPLETED"; }
    let plan = nextActions(doc, s);
    expect(plan.available.some(a => ["request-reviews", "competitor-improvement", "publish-manual"].includes(a.key))).toBe(false);
    s.at = "2026-10-08T09:00:00.000Z";
    plan = nextActions(doc, s);
    expect(plan.days[3].actions.some(a => a.key === "request-reviews")).toBe(true);
    expect(plan.days[4].actions).toHaveLength(1);
    expect(plan.days[5].actions).toHaveLength(1);
  });
  it("suppresses alternative post themes after one was completed, not just the same key", () => {
    const s = snapshot();
    let doc = updateNextAction(challengeDocument(), command("publish-manual"), s, "u");
    doc = updateNextAction(doc, command("publish-manual", "COMPLETED", "実際の公開URL"), s, "u");
    s.demand = [{ query: "自習", month: "2026-09", impressions: 10, updatedAt: s.at }];
    expect(nextActions(doc, s).days[4].actions).toEqual([]);
  });
  it.each([
    command("unknown"), command("request-reviews", "BAD"), command("request-reviews", "COMPLETED"),
    command("request-reviews", "COMPLETED", "実行"), command("request-reviews", "WAITING"),
  ])("rejects invalid/stale/unaudited mutations %#", c => expect(() => updateNextAction(challengeDocument(), c, snapshot(), "u")).toThrow());
  it("rejects duplicate completion instead of appending or overwriting", () => {
    const s = snapshot();
    let doc = updateNextAction(challengeDocument(), command("pending-replies"), s, "u");
    doc = updateNextAction(doc, command("pending-replies", "COMPLETED", "確認"), s, "u");
    expect(() => updateNextAction(doc, command("pending-replies", "COMPLETED", "再送"), s, "u")).toThrow("更新済み");
  });
});

describe("explicit adaptive request goals", () => {
  it("adopts zero additional requests without clearing unanswered reviews", () => {
    const s = snapshot(); const doc = challengeDocument();
    const saved = updateNextAction(doc, { action: "adopt-request-target", day: 4 }, s, "u");
    expect(saved.additionalTarget).toBe(0);
    expect(saved.additionalRequestTarget).toMatchObject({ count: 0, actorId: "u" });
    expect(challengeProgress(saved, s).days[3]).toMatchObject({ percent: 50, cleared: false });
    expect(() => updateChallenge(saved, { ...completeCommand(4), evidence: { requested: 0, reviews: "対象なし" } }, s, "u")).toThrow();
    expect(() => updateNextAction(saved, { action: "adopt-request-target", day: 4 }, s, "u")).toThrow();
    doc.missions[3].status = "IN_PROGRESS";
    expect(() => updateNextAction(doc, { action: "adopt-request-target", day: 4 }, s, "u")).toThrow();
    doc.missions[3].status = "NOT_STARTED"; doc.missions[3].evidence.requested = 1;
    expect(() => updateNextAction(doc, { action: "adopt-request-target", day: 4 }, s, "u")).toThrow();
    doc.missions[3].evidence = {}; doc.missions[2].status = "COMPLETED"; doc.missions[2].completedAt = "2026-01-01"; s.reviews = null;
    expect(() => updateNextAction(doc, { action: "adopt-request-target", day: 4 }, s, "u")).toThrow();
  });
  it.each([0, 5, 10])("persists a grounded goal %i and keeps legacy records compatible", target => {
    const s = snapshot(); s.latestReviewAt = s.at; s.reviews!.count = target === 0 ? 20 : target === 5 ? 3 : 0;
    const doc = challengeDocument();
    const saved = updateNextAction(doc, { action: "adopt-request-target", count: 999 }, s, "u");
    expect(saved.requestTarget).toMatchObject({ count: target, actorId: "u", at: s.at });
    expect(doc.requestTarget).toBeUndefined();
    expect(challengeProgress(doc, s).days[2].total).toBe(10);
    const done = updateChallenge(saved, { ...completeCommand(3), evidence: { requested: target } }, s, "u");
    expect(challengeProgress(done, s).days[2]).toMatchObject({ percent: 100, cleared: true, total: target });
    if (target > 0) expect(() => updateChallenge(saved, { ...completeCommand(3), evidence: { requested: target - 1 } }, s, "u")).toThrow();
    expect(() => updateNextAction(saved, { action: "adopt-request-target" }, s, "u")).toThrow();
  });
  it("does not mutate targets once started or when measurements are unknown", () => {
    const doc = challengeDocument(); const s = snapshot();
    doc.missions[2].status = "IN_PROGRESS";
    expect(() => updateNextAction(doc, { action: "adopt-request-target" }, s, "u")).toThrow();
    doc.missions[2].status = "NOT_STARTED"; doc.missions[2].evidence.requested = 1;
    expect(() => updateNextAction(doc, { action: "adopt-request-target" }, s, "u")).toThrow();
    doc.missions[2].evidence = {}; s.reviews = null;
    expect(() => updateNextAction(doc, { action: "adopt-request-target" }, s, "u")).toThrow();
  });
});

describe("action/mission evidence integration", () => {
  it("leaves legacy records and old clear history untouched", () => {
    const doc = challengeDocument(); const s = snapshot();
    expect(reconcileActionHistory(doc, s, "u")).toBe(doc);
    const active = updateNextAction(doc, { key: "pending-replies", status: "IN_PROGRESS", note: "" }, s, "u");
    active.missions[3].status = "COMPLETED"; active.missions[3].updatedAt = "2026-09-01";
    expect(reconcileActionHistory(active, s, "u").nextActionHistory![0].status).toBe("IN_PROGRESS");
  });
  it("completes matching recorded evidence, retaining deferred and unrelated checks", () => {
    const s = snapshot(); let doc = challengeDocument();
    for (const key of ["check-1-website", "check-1-hours", "pending-replies"]) doc = updateNextAction(doc, { key, status: "IN_PROGRESS", note: "" }, s, "u");
    doc.missions[0].updatedAt = s.at;
    doc.missions[0].evidence = { website: "確認済み", hours: "後で対応" };
    doc.missions[3].updatedAt = s.at;
    doc.missions[3].status = "COMPLETED"; doc.missions[3].note = "返信の反映を確認";
    const saved = reconcileActionHistory(doc, s, "u2");
    expect(saved.nextActionHistory!.map(r => r.status)).toEqual(["COMPLETED", "IN_PROGRESS", "COMPLETED"]);
    expect(saved.nextActionHistory![2].note).toBe("返信の反映を確認");
    expect(reconcileActionHistory(saved, s, "u3").nextActionHistory![0].actorId).toBe("u2");
  });
  it("does not claim Google linkage from a manual DAY1 completion", () => {
    const s = snapshot(); s.google = false;
    const doc = updateNextAction(challengeDocument(), { key: "google-connect", status: "IN_PROGRESS", note: "" }, s, "u");
    doc.missions[0].status = "COMPLETED"; doc.missions[0].updatedAt = s.at;
    expect(reconcileActionHistory(doc, s, "u").nextActionHistory![0].status).toBe("IN_PROGRESS");
    s.google = true;
    expect(reconcileActionHistory(doc, s, "u").nextActionHistory![0].status).toBe("COMPLETED");
  });
});
