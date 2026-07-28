import { describe, expect, it } from "vitest";
import {
  buildMockMonthlyReportData,
  normalizeMonthlyReportData,
} from "./reportData";

describe("monthly report mock data", () => {
  it("builds the required report sections", () => {
    const report = buildMockMonthlyReportData();

    expect(report.period).toBe("2026年7月度");
    expect(report.metrics).toHaveLength(4);
    expect(report.metrics.map((metric) => metric.label)).toEqual([
      "口コミ獲得・返信率",
      "MEO順位",
      "Instagram連携状況",
      "AIOスコア",
    ]);
    expect(report.actions.length).toBeGreaterThanOrEqual(3);
  });

  it("normalizes nullable values with safe fallbacks", () => {
    const report = normalizeMonthlyReportData({
      schoolName: "",
      period: null,
      score: 141,
      rank: null,
      metrics: [
        {
          label: "",
          value: null,
          detail: "返信率 80%",
          trend: "",
          tone: "alert",
        },
      ],
      actions: [{ title: "", detail: null, owner: "本部" }],
    });

    expect(report.schoolName).toBe("青葉ゼミナール 本校");
    expect(report.period).toBe("2026年7月度");
    expect(report.score).toBe(100);
    expect(report.rank).toBe("A");
    expect(report.metrics[0]).toMatchObject({
      label: "口コミ獲得・返信率",
      value: "18件 / 94%",
      detail: "返信率 80%",
      trend: "+4件・返信率 +12pt",
      tone: "alert",
    });
    expect(report.actions[0]).toMatchObject({
      title: "保護者への口コミ依頼を週2件追加",
      detail:
        "高評価の授業満足コメントを自然に増やし、口コミ獲得ペースを維持します。",
      owner: "本部",
    });
  });

  it("normalizes rank, score, tone, and overflow rows without losing safe defaults", () => {
    const report = normalizeMonthlyReportData({
      score: -12,
      rank: "S",
      metrics: [
        { tone: "good" },
        { tone: "watch" },
        { tone: "unknown" as never },
        { tone: null },
        { label: "", value: "", detail: "", trend: "", tone: "alert" },
      ],
      actions: [
        { title: "A", detail: "B", owner: "C" },
        { title: "", detail: "", owner: "" },
        { title: "", detail: "", owner: "" },
        { title: "", detail: "", owner: "" },
      ],
    });

    expect(report.score).toBe(0);
    expect(report.rank).toBe("S");
    expect(report.metrics.map((metric) => metric.tone)).toEqual([
      "good",
      "watch",
      "watch",
      "watch",
      "alert",
    ]);
    expect(report.metrics[4].label).toBe("口コミ獲得・返信率");
    expect(report.actions[3].title).toBe("保護者への口コミ依頼を週2件追加");
  });
});
