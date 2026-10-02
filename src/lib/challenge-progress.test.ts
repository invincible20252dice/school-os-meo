import { describe, expect, it } from "vitest";
import { missions, updateChallenge, type MissionProgress } from "./challenge";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
import { challengeProgress, dayProgress, fieldProgress, formatMetric, metricChange, priorityWeights } from "./challenge-progress";

const saved = (day: number, evidence: MissionProgress["evidence"] = {}) => ({ ...challengeDocument().missions[day - 1], evidence });
describe("challenge progress derived from saved evidence", () => {
  it("does not equate outcome counts, age, or connections to completed actions", () => {
    const doc = challengeDocument();
    const before = structuredClone(doc);
    const result = challengeProgress(doc, snapshot());
    expect(result.percent).toBe(0);
    expect(result.cleared).toBe(0);
    expect(result.days.map(d => d.total)).toEqual([7, 8, 10, 10, 1, 1, 3]);
    expect(result.recommended?.day).toBe(1);
    expect(doc).toEqual(before);
  });
  it("weights master-defined priorities while keeping actual counts separate", () => {
    const p = dayProgress(saved(1, { website: "確認済み", hours: "修正済み", name: "後で対応", phone: "要改善" }), 10, snapshot());
    const totalWeight = missions[0].fields.reduce((sum, f) => sum + priorityWeights[f.priority!], 0);
    expect(p.percent).toBe(Math.round(13 / totalWeight * 100));
    expect(p.done).toBe(2); expect(p.remaining).toBe(5);
    expect(p.recommended).toHaveLength(3);
    expect(p.recommended[0].key).toBe("phone");
    expect(p.incomplete.find(i => i.key === "name")?.deferred).toBe(true);
    expect(p.complete.map(i => i.key)).toEqual(["website", "hours"]);
  });
  it("uses the master rather than fixed UI item numbers", () => {
    const fields = missions[0].fields;
    missions[0].fields = [{ key: "custom", label: "新しい確認", type: "text", priority: "C" }];
    try {
      const result = dayProgress(saved(1, { custom: "確認した" }), 10, snapshot());
      expect(result).toMatchObject({ done: 1, total: 1, percent: 100 });
      expect(result.items[0].label).toBe("新しい確認");
    } finally { missions[0].fields = fields; }
  });
  it("handles unrecorded, deferred, warning, and whitespace without fabricating achievement", () => {
    const field = { key: "name", label: "教室名", type: "text" as const };
    for (const value of [undefined, "", "  ", "後で対応"]) {
      const result = fieldProgress(field, saved(1, value === undefined ? {} : { name: value }));
      expect(result.state).toBe("UNCHECKED"); expect(result.priority).toBe("B");
    }
    expect(fieldProgress(field, saved(1, { name: "要改善" })).state).toBe("WARNING");
  });
  it("computes photo category coverage, not photo counts", () => {
    expect(dayProgress(saved(2, { photo0: "追加済み", photo1: "既存写真で充足", photo2: "対象外", photo3: "後で対応" }), 10, snapshot())).toMatchObject({ done: 3, total: 8, remaining: 5, percent: 38 });
  });
  it.each([7, 10, 15])("calculates DAY3 %s requests independent of review outcomes", requested => {
    const p = dayProgress(saved(3, { requested }), 25, { ...snapshot(), reviews: null });
    expect(p.percent).toBe(Math.min(requested * 10, 100));
    expect(p.total).toBe(10); expect(p.remaining).toBe(Math.max(10 - requested, 0));
    expect(p.cleared).toBe(false);
  });
  it("requires both additional requests and response handling for DAY4 progress", () => {
    expect(dayProgress(saved(4, { requested: 6 }), 10, snapshot()).percent).toBe(30);
    expect(dayProgress(saved(4, { requested: 10, reviews: "対応済み" }), 10, snapshot()).percent).toBe(100);
    expect(dayProgress(saved(4, { requested: 6, reviews: "対応済み" }), 12, snapshot()).percent).toBe(75);
    expect(dayProgress(saved(4, { requested: 10, reviews: "対象なし" }), 10, snapshot()).percent).toBe(50);
    expect(dayProgress(saved(4, { requested: 10, reviews: "対象なし" }), 10, { ...snapshot(), reviews: { ...snapshot().reviews!, pending: 0 } }).percent).toBe(100);
    const unknown = dayProgress(saved(4, { requested: 10, reviews: "対象なし" }), 10, { ...snapshot(), reviews: null });
    expect(unknown.percent).toBe(50); expect(unknown.items[1].state).toBe("UNCHECKED");
    expect(dayProgress(saved(4), 10, { ...snapshot(), reviews: { ...snapshot().reviews!, pending: 0 } }).items[1].state).toBe("UNCHECKED");
  });
  it.each([5, 6])("requires all saved execution evidence for DAY%s", day => {
    expect(dayProgress(saved(day), 10, snapshot()).percent).toBe(0);
    expect(dayProgress(saved(day, completeCommand(day).evidence), 10, snapshot())).toMatchObject({ done: 1, total: 1, percent: 100 });
  });
  it("retains CLEAR history while deferred checks keep current progress below 100", () => {
    const command = completeCommand(1); command.evidence.hours = "後で対応";
    const doc = updateChallenge(challengeDocument(), command, snapshot(), "actor");
    expect(dayProgress(doc.missions[0], 10, snapshot()).cleared).toBe(true);
    expect(dayProgress(doc.missions[0], 10, snapshot()).percent).toBeLessThan(100);
  });
  it("averages percentages across units and recommends remaining checks after all clears", () => {
    let doc = challengeDocument();
    doc.missions[2].evidence = { requested: 7 };
    expect(challengeProgress(doc, snapshot()).percent).toBe(10);
    for (let day = 1; day <= 7; day++) doc = updateChallenge(doc, completeCommand(day), snapshot(), "actor");
    expect(challengeProgress(doc, snapshot())).toMatchObject({ percent: 100, cleared: 7, recommended: undefined });
    doc.missions[0].evidence.hours = "後で対応";
    expect(challengeProgress(doc, snapshot()).recommended?.day).toBe(1);
  });
  it("distinguishes missing before/current values from real zero and negative change", () => {
    expect(formatMetric(null)).toBe("未計測"); expect(formatMetric(undefined)).toBe("未計測");
    expect(formatMetric(0)).toBe("0件"); expect(formatMetric(12.34, "%")).toBe("12.3%");
    expect(metricChange(null, 4)).toBe("開始時データなし"); expect(metricChange(3, null)).toBe("現在は未計測");
    expect(metricChange(0, 3)).toBe("+3件"); expect(metricChange(3, 0)).toBe("-3件"); expect(metricChange(2, 2, "pt")).toBe("0pt");
  });
});
