import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeAioVisibility,
  buildAioPrompt,
  buildMockAioScoreDashboard,
  scoreAiResponse,
} from "./aio-analyzer";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("aio-analyzer", () => {
  it("builds a location-aware AIO prompt", () => {
    const prompt = buildAioPrompt({
      keyword: "個別指導 塾",
      nearestStation: "横浜駅",
      municipality: "横浜市西区",
    });

    expect(prompt).toContain("横浜駅");
    expect(prompt).toContain("横浜市西区");
    expect(prompt).toContain("個別指導 塾");
  });

  it("scores a positive own-school mention highly", () => {
    const result = scoreAiResponse({
      responseText:
        "横浜駅周辺なら青葉ゼミナール 本校がおすすめです。口コミも多く、個別指導の実績が豊富です。",
      ownSchoolName: "青葉ゼミナール 本校",
      competitorNames: ["横浜駅前個別アカデミー"],
    });

    expect(result.score).toBe(100);
    expect(result.mentioned).toBe(true);
    expect(result.sentiment).toBe("positive");
    expect(result.reasons).toContain("自校舎名が明示されています");
  });

  it("scores a weak mention lower than a recommendation", () => {
    const result = scoreAiResponse({
      responseText:
        "青葉ゼミナール 本校も候補の一つです。ただし横浜駅前個別アカデミーの方が口コミが多いです。",
      ownSchoolName: "青葉ゼミナール 本校",
      competitorNames: ["横浜駅前個別アカデミー"],
    });

    expect(result.score).toBe(55);
    expect(result.mentionedCompetitors).toEqual(["横浜駅前個別アカデミー"]);
  });

  it("returns zero when own school is not mentioned", () => {
    const result = scoreAiResponse({
      responseText: "横浜駅前個別アカデミーがよく知られています。",
      ownSchoolName: "青葉ゼミナール 本校",
      competitorNames: ["横浜駅前個別アカデミー"],
    });

    expect(result.score).toBe(0);
    expect(result.mentioned).toBe(false);
  });

  it("analyzes three AI engines and calculates total score", async () => {
    const result = await analyzeAioVisibility({
      ownSchoolName: "青葉ゼミナール 本校",
      keyword: "横浜駅 個別指導 塾",
      nearestStation: "横浜駅",
      municipality: "横浜市西区",
      competitorNames: ["横浜駅前個別アカデミー"],
      engines: {
        chatgpt:
          "青葉ゼミナール 本校は個別指導でおすすめです。口コミでも丁寧さが評価されています。",
        gemini: "横浜駅前個別アカデミーが有名です。",
        googleAi:
          "青葉ゼミナール 本校も候補です。横浜駅周辺で比較検討できます。",
      },
    });

    expect(result.chatgptScore).toBe(100);
    expect(result.geminiScore).toBe(0);
    expect(result.googleAiScore).toBe(55);
    expect(result.totalScore).toBe(52);
    expect(result.aiMentions.chatgpt.mentioned).toBe(true);
  });

  it("builds a dashboard demo matching the requested score cards", () => {
    const dashboard = buildMockAioScoreDashboard();

    expect(dashboard.summary.chatgptScore).toBe(100);
    expect(dashboard.summary.geminiScore).toBe(0);
    expect(dashboard.summary.googleAiScore).toBe(40);
    expect(dashboard.keywordRows).toHaveLength(3);
    expect(dashboard.actions.length).toBeGreaterThan(0);
  });
});
