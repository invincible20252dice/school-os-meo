import { describe, expect, it } from "vitest";
import {
  buildDifferentiationData,
  buildResultPostPreview,
  calculateRoiPercent,
  findDistrictAnalysis,
  getRetentionAlertCounts,
} from "./differentiationData";

describe("differentiation mock data", () => {
  it("builds data for ROI, result posts, retention alerts, and district competitors", () => {
    const data = buildDifferentiationData();

    expect(data.roi.trialApplications).toBe(18);
    expect(data.roi.channels).toHaveLength(3);
    expect(data.resultPost.preview.gbp).toContain("白川中学校");
    expect(data.retentionAlerts).toHaveLength(3);
    expect(data.schoolDistricts[0]?.competitors.length).toBeGreaterThan(0);
  });

  it("calculates ROI and guards zero monthly fee", () => {
    expect(calculateRoiPercent(1620000, 120000)).toBe(1350);
    expect(calculateRoiPercent(100000, 0)).toBe(0);
  });

  it("generates channel-optimized result post previews", () => {
    const preview = buildResultPostPreview({
      grade: "中3",
      schoolName: "白川中学校",
      result: "英語15点UP",
      subject: "英語",
      areaKeyword: "白川中",
      comment: "単語復習を毎日継続できました。",
    });

    expect(preview.gbp).toContain("白川中エリア");
    expect(preview.instagram).toContain("#英語対策");
    expect(preview.line).toContain("おめでとうございます");
    expect(preview.imageText).toContain("英語15点UP");
  });

  it("summarizes retention alerts and finds district analysis safely", () => {
    const data = buildDifferentiationData();

    expect(getRetentionAlertCounts(data.retentionAlerts)).toEqual({
      total: 3,
      unresolved: 3,
      critical: 2,
    });
    expect(findDistrictAnalysis(data.schoolDistricts, "熊本駅前エリア")?.id).toBe(
      "district-002",
    );
    expect(findDistrictAnalysis(data.schoolDistricts, "未登録")?.id).toBe(
      "district-001",
    );
    expect(findDistrictAnalysis([], "未登録")).toBeNull();
    expect(
      getRetentionAlertCounts([
        {
          id: "done",
          rating: undefined as never,
          guardianSegment: "",
          category: "",
          answeredAt: "",
          status: "完了",
          aiAdvice: "",
        },
      ]),
    ).toEqual({ total: 1, unresolved: 0, critical: 0 });
  });
});
