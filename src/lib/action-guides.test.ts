import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { guideForAction, guideForField, guideRegistry, photoGuides, postTopics } from "./action-guides";
import { snapshot } from "@/test/challenge-fixtures";

describe("execution guide registry", () => {
  it("maps all eight existing photo keys to verified project assets", () => {
    expect(photoGuides).toHaveLength(8);
    photoGuides.forEach((guide, index) => {
      expect(guideForAction(`check-2-photo${index}`)).toBe(guide);
      expect(guide.images![0].kind).toBe("GOOD");
      for (const image of guide.images!) { expect(existsSync(`public${image.src}`)).toBe(true); expect(image.alt).toContain("AI生成"); }
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
    });
    expect(photoGuides[0].images![1].kind).toBe("NG");
  });
  it.each(["name", "phone", "address", "category", "hours", "description", "website"])("resolves DAY1 %s without saved-key changes", field => {
    expect(guideForField(1, field)?.path).toBe("/dashboard/settings/google");
  });
  it.each(["contact", "links", "test"])("uses one contact guide for %s", field => {
    expect(guideForField(7, field)?.id).toBe("contact");
  });
  it.each([3, 4, 5, 6, 7])("shares DAY%d and field guides", day => {
    expect(guideForField(day, "any")?.id).toBe(guideForAction(`day-${day}`)?.id);
  });
  it("shares publishing, weekly, and related photo guides", () => {
    expect(guideForAction("publish-manual")).toBe(guideForAction("publish-大学受験"));
    expect(guideForAction("request-reviews")?.sample).toContain("率直");
    expect(guideForAction("competitor-improvement")?.relatedPhotos).toHaveLength(8);
    for (const guide of guideRegistry.values()) for (const id of guide.relatedPhotos ?? []) expect(guideRegistry.has(id)).toBe(true);
  });
  it("leaves unknown action keys optional", () => {
    for (const key of ["unknown", "check-1-unknown", "check-2-photo9", "check-7-unknown", "day-8"]) expect(guideForAction(key)).toBeUndefined();
    expect(guideForField(1, "unknown")).toBeUndefined();
  });
  it("ranks actual stored query impressions, deduplicates, and limits to three", () => {
    const row = (query: string, impressions: number) => ({ query, impressions, month: "2026-09", updatedAt: "2026-10-01" });
    const data = snapshot(); data.demand = [row("a", 4), row("b", 3), row("a", 2), row("c", 1), row("d", 0), row("e", 1)];
    const before = structuredClone(data);
    expect(postTopics(data).topics.map(t => t.query)).toEqual(["a", "b", "c"]);
    expect(postTopics(data).message).toContain("市場全体の検索数ではありません");
    expect(data).toEqual(before);
  });
  it("distinguishes failed, absent and empty data without invented themes", () => {
    expect(postTopics({ ...snapshot(), demand: null })).toMatchObject({ topics: [], message: expect.stringContaining("取得できません") });
    for (const demand of [undefined, []]) expect(postTopics({ ...snapshot(), demand })).toMatchObject({ topics: [], message: expect.stringContaining("保存データがありません") });
  });
});
