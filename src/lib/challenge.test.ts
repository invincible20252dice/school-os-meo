import { describe, expect, it } from "vitest";
import { ChallengeError, count, object, photoConfirmation, readDocument, remainingChecks, startChallenge, text, updateChallenge, weeklyActions } from "./challenge";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";

describe("school challenge rules", () => {
  it.each(["追加済み", "既存写真で充足"])("auto-completes DAY2 with %s and no memo even for legacy IN_PROGRESS commands", value => {
    const evidence = Object.fromEntries(Object.keys(completeCommand(2).evidence).map(key => [key, value]));
    const result = updateChallenge(challengeDocument(), { ...completeCommand(2), evidence, note: "", status: "IN_PROGRESS" }, snapshot(), "actor");
    expect(result.missions[1]).toMatchObject({ status: "COMPLETED", evidence, note: "", completedAt: snapshot().at });
    const later = updateChallenge(result, { ...completeCommand(2), evidence, note: "" }, { ...snapshot(), at: "2026-10-03T00:00:00Z" }, "actor");
    expect(later.missions[1].completedAt).toBe(snapshot().at);
  });
  it("requires only an exemption reason, preserves the original note key, and never clears on a forced status", () => {
    const command = { ...completeCommand(2), evidence: { ...completeCommand(2).evidence, photo7: "対象外" }, note: " " };
    const pending = updateChallenge(challengeDocument(), command, snapshot(), "actor");
    expect(pending.missions[1].status).toBe("IN_PROGRESS");
    expect(photoConfirmation(command.evidence, "").remaining).toEqual([expect.objectContaining({ key: "photo7", reason: "対象外の理由を入力してください。" })]);
    const done = updateChallenge(pending, { ...command, note: "専用駐車場がないため" }, snapshot(), "actor");
    expect(done.missions[1]).toMatchObject({ status: "COMPLETED", note: "専用駐車場がないため" });
  });
  it.each([["後で対応", "WAITING"], ["要改善", "IN_PROGRESS"], ["", "IN_PROGRESS"]])("retains incomplete DAY2 %s without a required memo", (answer, status) => {
    const command = { ...completeCommand(2), evidence: { ...completeCommand(2).evidence, photo3: answer }, note: "" };
    const cleared = updateChallenge(challengeDocument(), completeCommand(2), snapshot(), "actor");
    const result = updateChallenge(cleared, command, snapshot(), "actor");
    expect(result.missions[1]).toMatchObject({ status, completedAt: null });
    expect(photoConfirmation(command.evidence, "").remaining[0].key).toBe("photo3");
  });
  it("keeps untouched DAY2 NOT_STARTED, and prioritizes real missing work over deferred checks", () => {
    expect(photoConfirmation({}, "").status).toBe("NOT_STARTED");
    expect(photoConfirmation({ photo0: "後で対応" }, "").status).toBe("IN_PROGRESS");
  });
  it.each(["確認済み", "修正済み"])("completes DAY1 with %s answers and an optional empty note", answer => {
    const command = completeCommand(1);
    command.evidence = Object.fromEntries(Object.keys(command.evidence).map(key => [key, answer]));
    command.note = "";
    expect(updateChallenge(challengeDocument(), command, snapshot(), "actor").missions[0]).toMatchObject({ status: "COMPLETED", note: "", completedAt: snapshot().at });
  });
  it.each(["後で対応", "要改善"])("keeps B-priority %s as a remaining task after CLEAR", value => {
    const command = completeCommand(1); command.evidence.hours = value;
    const result = updateChallenge(challengeDocument(), command, snapshot(), "actor");
    expect(result.missions[0].status).toBe("COMPLETED");
    expect(remainingChecks(result)).toEqual([{ day: 1, key: "hours", label: "通常・特別営業時間" }]);
    expect(() => updateChallenge(challengeDocument(), { ...command, note: "" }, snapshot(), "actor")).toThrow("理由");
  });
  it.each(["name", "phone", "address", "category", "website"])("never grants the first CLEAR while critical %s is deferred", key => {
    const command = completeCommand(1); command.evidence[key] = "後で対応";
    expect(() => updateChallenge(challengeDocument(), command, snapshot(), "actor")).toThrow("重要な未対応項目");
  });
  it("preserves CLEAR history and baseline when current checks need attention again", () => {
    const cleared = updateChallenge(challengeDocument(), completeCommand(1), snapshot(), "actor");
    const command = completeCommand(1); command.evidence.website = "要改善";
    const later = updateChallenge(cleared, command, { ...snapshot(), at: "2026-10-02T09:00:00Z" }, "actor");
    expect(later.missions[0].completedAt).toBe(cleared.missions[0].completedAt);
    expect(later.missions[0].status).toBe("COMPLETED");
    expect(later.baseline).toEqual(cleared.baseline);
    expect(remainingChecks(later)).toEqual([{ day: 1, key: "website", label: "Webサイト" }]);
    expect(weeklyActions(later, snapshot())).toContainEqual(expect.objectContaining({ key: "check-1-website", status: "IN_PROGRESS", reason: "要改善として記録された残課題" }));
  });
  it.each([[1, "website", "要改善"], [7, "test", "要改善"]])("does not grant a first CLEAR with unresolved DAY%s evidence", (day, key, value) => {
    const command = completeCommand(Number(day)); command.evidence[String(key)] = String(value);
    expect(() => updateChallenge(challengeDocument(), command, snapshot(), "actor")).toThrow("未対応項目");
    expect(updateChallenge(challengeDocument(), { ...command, status: "WAITING" }, snapshot(), "actor").missions[Number(day) - 1].status).toBe("WAITING");
  });
  it("persists seven missions on the same day without requiring outcomes or elapsed days", () => {
    let doc = challengeDocument();
    const before = structuredClone(doc);
    for (let day = 1; day <= 7; day++) doc = updateChallenge(doc, completeCommand(day), snapshot(), "actor");
    expect(doc.missions.every(m => m.status === "COMPLETED" && m.actorId === "actor")).toBe(true);
    expect(doc.completedAt).toBe(doc.startedAt);
    expect(doc.after).toEqual(snapshot());
    expect(doc.baseline).toEqual(before.baseline);
    expect(before.missions.every(m => m.status === "NOT_STARTED")).toBe(true);
    const later = { ...snapshot(), at: "2026-10-02T09:00:00Z" };
    const repeated = updateChallenge(doc, completeCommand(7), later, "actor2");
    expect(repeated.completedAt).toBe(doc.completedAt);
    expect(repeated.missions[6].completedAt).toBe(doc.startedAt);
    expect(repeated.missions[6].updatedAt).toBe(later.at);
    const reopened = updateChallenge(doc, { ...completeCommand(7), status: "IN_PROGRESS" }, later, "actor");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.missions[6].completedAt).toBeNull();
  });
  it("keeps deferred checks visible even when DAY1 records are complete", () => {
    const command = completeCommand(1); command.evidence.hours = "後で対応";
    const doc = updateChallenge(challengeDocument(), command, snapshot(), "actor");
    expect(remainingChecks(doc)).toEqual([{ day: 1, key: "hours", label: "通常・特別営業時間" }]);
    expect(weeklyActions(doc, snapshot())).toContainEqual(expect.objectContaining({ key: "check-1-hours", status: "DEFERRED" }));
  });
  it.each(["DEFERRED", "WAITING", "IN_PROGRESS", "NOT_STARTED"])("saves partial evidence for %s without marking complete", status => {
    const doc = updateChallenge(challengeDocument(), { action: "mission", day: 1, status, evidence: { name: "", extra: "ignored" }, note: "確認を依頼中" }, snapshot(), "actor");
    expect(doc.missions[0]).toMatchObject({ status, completedAt: null, evidence: {} });
  });
  it("stores inquiry totals separately from tests and never counts clicks as inquiries", () => {
    const command = { action: "inquiries", google: 1, unknown: 2, other: 3, tests: 99 };
    const doc = updateChallenge(challengeDocument(), command, snapshot(), "actor");
    expect(doc.inquiries).toEqual({ google: 1, unknown: 2, other: 3, tests: 99, recordedAt: snapshot().at, actorId: "actor" });
    expect(updateChallenge(doc, command, snapshot(), "actor").inquiries).toEqual(doc.inquiries);
  });
  it("generates explainable weekly tasks with stable keys and persistent manual decisions", () => {
    const state = { ...snapshot(), google: false };
    const initial = challengeDocument();
    expect(weeklyActions(initial, state).map(a => a.key)).toEqual(expect.arrayContaining(["day-1", "day-7", "google-connect", "pending-replies", "publish-post"]));
    const doc = updateChallenge(initial, { action: "weekly", key: "pending-replies", status: "COMPLETED", note: "Google画面で返信済みを確認" }, state, "actor");
    expect(weeklyActions(doc, state).find(a => a.key === "pending-replies")?.status).toBe("COMPLETED");
    const deferred = updateChallenge(doc, { action: "weekly", key: "google-connect", status: "DEFERRED", note: "承認待ち" }, state, "actor");
    expect(deferred.actions["google-connect"].status).toBe("DEFERRED");
    const clean = { ...state, google: true, reviews: null, posts: { count: 1, latestAt: state.at } };
    expect(weeklyActions(doc, clean).filter(a => !a.day)).toEqual([]);
    expect(weeklyActions(doc, { ...clean, posts: { count: 1, latestAt: "2026-01-01" } }).some(a => a.key === "publish-post")).toBe(true);
    expect(weeklyActions(doc, { ...clean, posts: null }).filter(a => !a.day)).toEqual([]);
  });
  it.each([
    { ...completeCommand(1), evidence: {} },
    { ...completeCommand(5), evidence: { published: "公開確認済み", publication: "   " } },
    { ...completeCommand(1), evidence: { name: "invalid" } },
    { ...completeCommand(3), evidence: { requested: 9 } },
    { ...completeCommand(4), evidence: { requested: 9, reviews: "対応済み" } },
    { ...completeCommand(6), evidence: { ...completeCommand(6).evidence, comparisonId: "other-school" } },
    { action: "mission", day: 9 }, { action: "mission", day: 1, status: "INVALID" },
    { action: "destroy" }, { action: "weekly", key: "day-1", status: "COMPLETED" },
    { action: "weekly", key: "pending-replies", status: "INVALID" },
    { action: "weekly", key: "pending-replies", status: "COMPLETED", note: "" },
  ])("rejects fabricated or insufficient completion evidence %#", command => {
    expect(() => updateChallenge(challengeDocument(), command, snapshot(), "actor")).toThrow(ChallengeError);
  });
  it.each([null, { ...snapshot().reviews!, pending: 1 }])("rejects no-target assertions when reviews are unknown or pending", reviews => {
    expect(() => updateChallenge(challengeDocument(), { ...completeCommand(4), evidence: { requested: 10, reviews: "対象なし" } }, { ...snapshot(), reviews }, "actor")).toThrow("未対応口コミ");
  });
  it("allows no-target with verified zero and preserves missing measurements", () => {
    const state = { ...snapshot(), reviews: { ...snapshot().reviews!, pending: 0 }, posts: null };
    expect(updateChallenge(challengeDocument(), { ...completeCommand(4), evidence: { requested: 10, reviews: "対象なし" } }, state, "actor").missions[3].status).toBe("COMPLETED");
    expect(startChallenge(1, state).baseline.posts).toBeNull();
    expect(() => updateChallenge(challengeDocument(), completeCommand(6), { ...state, comparisons: null }, "actor")).toThrow("競合計測");
  });
  it.each([null, [], 1, "text"])("rejects invalid objects %j", value => expect(() => object(value)).toThrow());
  it.each([-1, 0.5, 10001, "10", null, NaN])("validates counts %j", value => expect(() => count(value)).toThrow());
  it("validates bounded strings, schema versions and targets", () => {
    expect(count(0)).toBe(0); expect(count(10000)).toBe(10000); expect(text(" a ")).toBe("a");
    expect(() => text(null)).toThrow(); expect(() => text("a".repeat(2001))).toThrow();
    expect(() => startChallenge(0, snapshot())).toThrow();
    expect(readDocument(challengeDocument())).toEqual(challengeDocument());
    for (const value of [{}, { schemaVersion: 1 }, { schemaVersion: 1, missions: [] }]) expect(() => readDocument(value)).toThrow();
  });
});
