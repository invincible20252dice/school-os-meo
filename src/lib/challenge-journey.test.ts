import { describe, expect, it } from "vitest";
import { dayChecks, dayTitle, deriveJourney, fieldAnchor } from "./challenge-journey";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
import { missions, updateChallenge } from "./challenge";

describe("read-only challenge journey", () => {
  it("separates current, requested and invalid viewing days without mutating saved history", () => {
    const doc = updateChallenge(challengeDocument(), completeCommand(1), snapshot(), "actor");
    doc.missions[1].status = "DEFERRED";
    const before = structuredClone(doc);
    for (const day of [0, 1, 4, 99, -1, 2.5]) {
      const view = deriveJourney(doc, snapshot(), day);
      expect(view.currentDay?.day).toBe(2);
      expect(view.viewingDay?.day).toBe([1, 4].includes(day) ? day : 2);
    }
    expect(doc).toEqual(before);
  });
  it("orders actionable before deferred, then priority and definition order, not warning first", () => {
    const doc = challengeDocument();
    expect(deriveJourney(doc, snapshot()).currentTask?.key).toBe("website");
    doc.missions[0].evidence = { website: "後で対応", phone: "要改善" };
    expect(deriveJourney(doc, snapshot()).currentTask?.key).toBe("name");
    doc.missions[0].evidence = { ...completeCommand(1).evidence, website: "後で対応" };
    expect(deriveJourney(doc, snapshot()).currentTask?.key).toBe("website");
    expect(deriveJourney(doc, snapshot()).dayCompletion).toEqual({ done: 6, total: 7, remaining: 1 });
  });
  it("counts photo categories and does not equate fully checked with CLEAR", () => {
    const doc = updateChallenge(challengeDocument(), completeCommand(1), snapshot(), "actor");
    doc.missions[1].evidence = completeCommand(2).evidence;
    delete doc.missions[1].evidence.photo3; delete doc.missions[1].evidence.photo4;
    expect(deriveJourney(doc, snapshot())).toMatchObject({ completed: 1, currentTask: { key: "photo3" }, dayCompletion: { done: 6, total: 8, remaining: 2 } });
    doc.missions[1].evidence = completeCommand(2).evidence;
    expect(deriveJourney(doc, snapshot())).toMatchObject({ currentDay: { day: 2 }, currentTask: null, completed: 1 });
  });
  it("requires explicit zero requests and distinguishes request targets from field counts", () => {
    const doc = challengeDocument();
    doc.requestTarget = { count: 0, reason: "確認済み", at: snapshot().at, actorId: "actor" };
    expect(dayChecks(doc, doc.missions[2], snapshot())[0].state).toBe("UNCHECKED");
    doc.missions[2].evidence.requested = 0;
    expect(dayChecks(doc, doc.missions[2], snapshot())[0].state).toBe("GOOD");
    doc.missions[3].evidence = { requested: 10, reviews: "対象なし" };
    expect(dayChecks(doc, doc.missions[3], snapshot()).filter(i => i.state === "GOOD")).toHaveLength(1);
    expect(dayChecks(doc, doc.missions[3], { ...snapshot(), reviews: { ...snapshot().reviews!, pending: 0 } }).filter(i => i.state === "GOOD")).toHaveLength(2);
  });
  it("targets actual DAY5/6 fields instead of synthetic execution keys", () => {
    const doc = challengeDocument();
    for (const day of [5, 6]) {
      doc.missions[day - 1].evidence = completeCommand(day).evidence;
      const checks = dayChecks(doc, doc.missions[day - 1], snapshot());
      expect(checks.map(i => i.key)).toEqual(missions[day - 1].fields.map(f => f.key));
      expect(checks.every(i => i.state === "GOOD")).toBe(true);
    }
    for (const comparisons of [null, []]) expect(dayChecks(doc, doc.missions[5], { ...snapshot(), comparisons })[0].state).toBe("UNCHECKED");
  });
  it("finishes only after all seven statuses are complete, while allowing read-only past views", () => {
    const doc = challengeDocument(); doc.missions.forEach(m => { m.status = "COMPLETED"; });
    expect(deriveJourney(doc, snapshot())).toMatchObject({ currentDay: null, currentTask: null, viewingDay: null, completed: 7, dayCompletion: { done: 0, total: 0, remaining: 0 } });
    expect(deriveJourney(doc, snapshot(), 7).viewingDay?.day).toBe(7);
    expect(dayTitle(7)).toBe("問い合わせ導線を改善する");
    expect(dayTitle(1)).toBe(missions[0].title);
    expect(fieldAnchor(2, "photo3")).toBe("challenge-day-2-photo3");
  });
});
