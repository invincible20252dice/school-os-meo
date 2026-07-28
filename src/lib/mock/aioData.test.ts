import { describe, expect, it } from "vitest";
import {
  buildMockAioDashboardData,
  normalizeAioDashboardData,
} from "./aioData";

describe("aioData", () => {
  it("builds mock AIO dashboard data for the requested screen", () => {
    const data = buildMockAioDashboardData();

    expect(data.metrics).toHaveLength(4);
    expect(data.metrics.map((metric) => metric.label)).toEqual([
      "総合AIOスコア",
      "ChatGPT推奨率",
      "Perplexity露出度",
      "ターゲットキーワード捕捉数",
    ]);
    expect(data.trend.length).toBeGreaterThan(1);
    expect(data.radar.length).toBeGreaterThan(3);
    expect(data.mentions.length).toBeGreaterThan(0);
  });

  it("normalizes nullable AIO data for safe rendering", () => {
    const data = normalizeAioDashboardData({
      schoolName: null,
      subtitle: "",
      metrics: [{ label: null, value: "90/100", helper: null, trend: null }],
      trend: [{ date: null, score: Number.NaN }],
      radar: [{ axis: "", ownSchool: undefined, competitor: null }],
      mentions: [
        {
          query: null,
          chatgptSummary: "",
          perplexitySummary: null,
          geminiSummary: undefined,
          status: undefined,
          action: "",
        },
      ],
    });

    expect(data.schoolName).toBe("青葉ゼミナール 本校");
    expect(data.subtitle).toBe(
      "AI検索エンジンにおける自校の言及率・推奨度スコアの分析",
    );
    expect(data.metrics[0].label).toBe("総合AIOスコア");
    expect(data.metrics[0].value).toBe("90/100");
    expect(data.trend[0].date).toBe("6/28");
    expect(data.trend[0].score).toBe(58);
    expect(data.radar[0].axis).toBe("認知度");
    expect(data.mentions[0].status).toBe("普通");
  });

  it("uses first fallback rows when custom arrays are longer than bundled mock data", () => {
    const data = normalizeAioDashboardData({
      metrics: Array.from({ length: 5 }, (_, index) => ({
        label: index === 4 ? "" : `指標${index}`,
        value: null,
        helper: "",
      })),
      trend: Array.from({ length: 9 }, (_, index) => ({
        date: index === 8 ? "" : `7/${index}`,
        score: index,
      })),
      radar: Array.from({ length: 6 }, (_, index) => ({
        axis: index === 5 ? "" : `軸${index}`,
        ownSchool: index,
        competitor: Number.NaN,
      })),
      mentions: [
        { status: "高推奨" },
        { status: "未言及" },
        { status: "not-valid" as never },
        { query: "", action: null },
      ],
    });

    expect(data.metrics[4].label).toBe("総合AIOスコア");
    expect(data.trend[8].date).toBe("6/28");
    expect(data.radar[5].axis).toBe("認知度");
    expect(data.mentions.map((mention) => mention.status)).toEqual([
      "高推奨",
      "未言及",
      "普通",
      "普通",
    ]);
  });

  it("returns bundled defaults when no override data is supplied", () => {
    const data = normalizeAioDashboardData();

    expect(data.metrics).toHaveLength(4);
    expect(data.trend).toHaveLength(8);
    expect(data.radar).toHaveLength(5);
    expect(data.mentions).toHaveLength(3);
  });
});
