import { describe, expect, it } from "vitest";
import {
  activateSurveySetting,
  buildMockSurveySettingList,
  buildMockSurveyEditorState,
  buildSurveyPreviewSteps,
  getTextQuestionHelperText,
  getTextQuestionPlaceholder,
  deleteSurveySetting,
  moveSurveyItem,
  normalizeSurveyItemOrder,
  saveSurveySetting,
  validateSurveyEditorState,
} from "./survey-builder";

describe("survey-builder", () => {
  it("builds editable survey settings with dynamic items", () => {
    const survey = buildMockSurveyEditorState();

    expect(survey.title).toBe("202501 口コミ促進アンケート");
    expect(survey.activeWeekdays).toEqual(["月", "火", "水", "木", "金"]);
    expect(survey.hasIncentive).toBe(true);
    expect(survey.items).toHaveLength(4);
    expect(survey.items[0]).toEqual(
      expect.objectContaining({
        type: "SINGLE_SELECT",
        question: "通塾のきっかけを教えてください",
        order: 1,
      }),
    );
  });

  it("validates character count and required question fields", () => {
    const survey = buildMockSurveyEditorState();

    expect(validateSurveyEditorState(survey)).toEqual([]);
    expect(
      validateSurveyEditorState({
        ...survey,
        minCharCount: 400,
        maxCharCount: 100,
        activeWeekdays: [],
        items: [{ ...survey.items[0], question: "" }],
      }),
    ).toEqual([
      "最小文字数は最大文字数以下にしてください。",
      "公開する曜日を1つ以上選択してください。",
      "1番目の設問文を入力してください。",
    ]);
  });

  it("requires options for selectable questions", () => {
    const survey = buildMockSurveyEditorState();

    expect(
      validateSurveyEditorState({
        ...survey,
        title: "",
        items: [
          { ...survey.items[0], options: [] },
          { ...survey.items[2], options: [] },
        ],
      }),
    ).toEqual([
      "アンケート名を入力してください。",
      "1番目の選択肢を1つ以上入力してください。",
    ]);
  });

  it("builds smartphone preview steps in display order", () => {
    const survey = buildMockSurveyEditorState();
    const preview = buildSurveyPreviewSteps({
      ...survey,
      items: [...survey.items].reverse(),
    });

    expect(preview.map((item) => item.id)).toEqual([
      "item-004",
      "item-003",
      "item-002",
      "item-001",
    ]);
    expect(preview.map((item) => item.order)).toEqual([1, 2, 3, 4]);
    expect(preview[1].helperText).toBe("100〜300文字を目安に入力");
    expect(preview[1].placeholder).toBe(
      "例: 苦手だった数学に自信がつき、家でも自分から机に向かうようになりました。",
    );
  });

  it("builds preview helper text for each question type without max select", () => {
    const survey = buildMockSurveyEditorState();
    const preview = buildSurveyPreviewSteps({
      ...survey,
      minCharCount: 80,
      maxCharCount: 240,
      items: [
        { ...survey.items[2], order: 3 },
        { ...survey.items[0], order: 1 },
        { ...survey.items[1], order: 2, maxSelect: undefined },
      ],
    });

    expect(preview.map((item) => item.id)).toEqual([
      "item-003",
      "item-001",
      "item-002",
    ]);
    expect(preview.map((item) => item.helperText)).toEqual([
      "80〜240文字を目安に入力",
      "1つ選択してください",
      "1つ選択してください",
    ]);
  });

  it("builds smart text placeholders and helper text from question wording", () => {
    expect(getTextQuestionPlaceholder("高校はどこですか？")).toBe(
      "例: 熊本高校、済々黌高校、第一高校 など",
    );
    expect(getTextQuestionHelperText("高校はどこですか？", 100, 300)).toBe(
      "学校名を入力してください",
    );
    expect(getTextQuestionPlaceholder("入塾のきっかけを教えてください")).toBe(
      "例: 大学受験に向けて苦手科目を個別でじっくり対策したかったため。",
    );
    expect(getTextQuestionPlaceholder("補足があれば教えてください", "例: 部活との両立")).toBe(
      "例: 部活との両立",
    );
    expect(getTextQuestionPlaceholder("その他")).toBe("ご自由に入力してください");
  });

  it("uses school-name helper text for short free-text questions in preview", () => {
    const survey = buildMockSurveyEditorState();
    const preview = buildSurveyPreviewSteps({
      ...survey,
      items: [
        {
          id: "school-name",
          type: "TEXT",
          question: "高校はどこですか？",
          options: [],
          order: 1,
        },
      ],
    });

    expect(preview[0].helperText).toBe("学校名を入力してください");
    expect(preview[0].placeholder).toBe("例: 熊本高校、済々黌高校、第一高校 など");
  });

  it("moves survey items up and down while renumbering display order", () => {
    const survey = buildMockSurveyEditorState();
    const movedUp = moveSurveyItem(survey.items, "item-003", "up");

    expect(movedUp.map((item) => item.id)).toEqual([
      "item-001",
      "item-003",
      "item-002",
      "item-004",
    ]);
    expect(movedUp.map((item) => item.order)).toEqual([1, 2, 3, 4]);

    const movedDown = moveSurveyItem(movedUp, "item-003", "down");
    expect(movedDown.map((item) => item.id)).toEqual([
      "item-001",
      "item-002",
      "item-003",
      "item-004",
    ]);
    expect(moveSurveyItem(movedDown, "item-001", "up")).toEqual(movedDown);
    expect(moveSurveyItem(movedDown, "item-004", "down")).toEqual(movedDown);
  });

  it("normalizes item order from the current array sequence", () => {
    const survey = buildMockSurveyEditorState();

    expect(
      normalizeSurveyItemOrder([...survey.items].reverse()).map((item) => ({
        id: item.id,
        order: item.order,
      })),
    ).toEqual([
      { id: "item-004", order: 1 },
      { id: "item-003", order: 2 },
      { id: "item-002", order: 3 },
      { id: "item-001", order: 4 },
    ]);
  });

  it("builds a mock settings list with active and incentive states", () => {
    const settings = buildMockSurveySettingList();

    expect(settings).toHaveLength(2);
    expect(settings.map((setting) => setting.isValid)).toEqual([true, false]);
    expect(settings.map((setting) => setting.hasIncentive)).toEqual([
      true,
      false,
    ]);
  });

  it("saves new and existing survey settings with normalized incentive data", () => {
    const settings = buildMockSurveySettingList();
    const newSurvey = {
      ...buildMockSurveyEditorState(),
      id: "survey-new",
      title: "新規アンケート",
      isValid: false,
      hasIncentive: false,
      benefitType: "未使用クーポン",
      benefitShowTiming: "常時表示",
    };

    const created = saveSurveySetting(settings, newSurvey, "2026-07-28 12:00");
    expect(created[0]).toMatchObject({
      id: "survey-new",
      title: "新規アンケート",
      hasIncentive: false,
      benefitType: "",
      benefitShowTiming: "",
      createdAt: "2026-07-28 12:00",
      updatedAt: "2026-07-28 12:00",
    });

    const updated = saveSurveySetting(
      created,
      {
        ...created[1],
        title: "更新済みアンケート",
        hasIncentive: true,
        benefitType: "面談クーポン",
      },
      "2026-07-28 12:30",
    );

    expect(updated[1]).toMatchObject({
      id: "survey-demo-001",
      title: "更新済みアンケート",
      benefitType: "面談クーポン",
      createdAt: "2026-07-01 10:20",
      updatedAt: "2026-07-28 12:30",
    });
  });

  it("activates one survey and blocks deleting the active survey", () => {
    const settings = buildMockSurveySettingList();
    const activated = activateSurveySetting(settings, "survey-demo-002");

    expect(activated.map((setting) => setting.isValid)).toEqual([false, true]);

    expect(deleteSurveySetting(activated, "survey-demo-002")).toEqual({
      settings: activated,
      blockedReason:
        "適用中のアンケートは削除できません。先に別のアンケートを選択してください。",
    });

    expect(deleteSurveySetting(activated, "survey-demo-001")).toEqual({
      settings: [activated[1]],
      blockedReason: null,
    });
  });
});
