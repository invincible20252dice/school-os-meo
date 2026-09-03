import { describe, expect, it } from "vitest";
import {
  buildGbpReplySystemPrompt,
  buildPromptSettingMutation,
  joinKeywordList,
  serializePromptSetting,
  splitKeywordText,
} from "./prompt-settings";

describe("prompt-settings", () => {
  it("normalizes keyword text from arrays, comma text, and newline text", () => {
    expect(splitKeywordText([" 自習室 ", "", "大学受験"])).toEqual([
      "自習室",
      "大学受験",
    ]);
    expect(splitKeywordText("個別指導, 大学受験\n逆転合格")).toEqual([
      "個別指導",
      "大学受験",
      "逆転合格",
    ]);
    expect(splitKeywordText(null)).toEqual([]);
    expect(joinKeywordList(["自習室", "大学受験"])).toBe("自習室, 大学受験");
  });

  it("serializes saved DB prompt columns into UI and DB-compatible keys", () => {
    const setting = serializePromptSetting("school-1", {
      id: "setting-1",
      promptSystemRole: "校舎責任者として返信してください。",
      promptReviewTone: "温かく丁寧",
      promptMustKeywords: ["自習室", "個別指導"],
      promptForbiddenWords: ["絶対合格"],
      promptTargetLength: "160-220文字",
      promptAutoReplyApproval: true,
      updatedAt: new Date("2026-09-01T10:20:00.000Z"),
    });

    expect(setting).toMatchObject({
      id: "setting-1",
      schoolId: "school-1",
      systemPrompt: "校舎責任者として返信してください。",
      tone: "温かく丁寧",
      includeKeywords: "自習室, 個別指導",
      ngKeywords: "絶対合格",
      targetLength: "160-220文字",
      autoReplyApproval: true,
      promptSystemRole: "校舎責任者として返信してください。",
      promptReviewTone: "温かく丁寧",
      promptMustKeywords: ["自習室", "個別指導"],
      promptForbiddenWords: ["絶対合格"],
      promptTargetLength: "160-220文字",
      promptAutoReplyApproval: true,
      updatedAt: "2026-09-01 10:20",
    });
  });

  it("uses defaults for missing prompt settings and accepts UI aliases for mutation", () => {
    expect(serializePromptSetting("school-1", null)).toMatchObject({
      systemPrompt: expect.stringContaining("大学受験専門塾"),
      tone: "丁寧・誠実・保護者目線",
      targetLength: "150-250文字",
      autoReplyApproval: false,
    });

    expect(
      buildPromptSettingMutation({
        systemPrompt: "返信方針",
        tone: "誠実",
        includeKeywords: "自習室, 大学受験",
        ngKeywords: "保証\n100%",
        targetLength: "170-230文字",
        autoReplyApproval: true,
      }),
    ).toEqual({
      promptSystemRole: "返信方針",
      promptReviewTone: "誠実",
      promptMustKeywords: ["自習室", "大学受験"],
      promptForbiddenWords: ["保証", "100%"],
      promptTargetLength: "170-230文字",
      promptAutoReplyApproval: true,
    });
  });

  it("prefers UI aliases and handles string dates when serializing prompt settings", () => {
    const setting = serializePromptSetting("school-1", {
      systemPrompt: "UI入力のシステムプロンプト",
      promptSystemRole: "DB側のシステムプロンプト",
      tone: "UI入力のトーン",
      promptReviewTone: "DB側のトーン",
      includeKeywords: ["質問対応", "自習室"],
      promptMustKeywords: ["大学受験"],
      ngKeywords: "過剰表現",
      promptForbiddenWords: ["保証"],
      targetLength: "180-220文字",
      promptTargetLength: "150-250文字",
      autoReplyApproval: false,
      promptAutoReplyApproval: true,
      updatedAt: "2026-09-01 19:30",
    });

    expect(setting).toMatchObject({
      systemPrompt: "UI入力のシステムプロンプト",
      tone: "UI入力のトーン",
      includeKeywords: "質問対応, 自習室",
      ngKeywords: "過剰表現",
      targetLength: "180-220文字",
      autoReplyApproval: false,
      updatedAt: "2026-09-01 19:30",
    });
  });

  it("falls back to DB aliases and defaults when mutation values are blank", () => {
    expect(
      buildPromptSettingMutation({
        systemPrompt: "",
        promptSystemRole: "DBプロンプト",
        tone: "",
        promptReviewTone: "DBトーン",
        promptMustKeywords: ["自習室"],
        promptForbiddenWords: ["最低"],
        targetLength: "",
        promptTargetLength: "120-160文字",
        promptAutoReplyApproval: true,
      }),
    ).toEqual({
      promptSystemRole: "DBプロンプト",
      promptReviewTone: "DBトーン",
      promptMustKeywords: ["自習室"],
      promptForbiddenWords: ["最低"],
      promptTargetLength: "120-160文字",
      promptAutoReplyApproval: true,
    });
  });

  it("builds a GBP reply system prompt that includes school-specific controls", () => {
    const prompt = buildGbpReplySystemPrompt({
      schoolId: "school-1",
      promptSystemRole: "塾長として返信してください。",
      promptReviewTone: "落ち着いた感謝",
      promptMustKeywords: ["個別指導"],
      promptForbiddenWords: ["絶対"],
      promptTargetLength: "150-200文字",
    });

    expect(prompt).toContain("塾長として返信してください。");
    expect(prompt).toContain("落ち着いた感謝");
    expect(prompt).toContain("個別指導");
    expect(prompt).toContain("絶対");
    expect(prompt).toContain("150-200文字");
    expect(prompt).toContain("NGワードは絶対に含めないでください");
  });
});
