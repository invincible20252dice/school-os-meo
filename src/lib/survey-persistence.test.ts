import { describe, expect, it, vi } from "vitest";
vi.mock("./gbp-review-draft", () => ({ generateReviewReplyDraft: vi.fn(async () => "回答ありがとうございます。") }));
import {
  DEFAULT_SCHOOL_ID,
  ensureSchoolForPersistence,
  normalizeSurveyPersistenceInput,
  normalizeSurveyResponseInput,
  persistSurvey,
  persistSurveyResponse,
  toJapanesePersistenceError,
} from "./survey-persistence";

const managerAccess = {
  access: {
    userId: "manager",
    role: "manager" as const,
    schoolId: "school-own",
    schoolIds: ["school-own"],
    name: "教室長",
    email: "manager@example.com",
    source: "profiles" as const,
  },
  isAuthenticated: true,
};
const adminAccess = {
  access: {
    userId: "admin",
    role: "admin" as const,
    schoolId: "",
    schoolIds: [],
    name: "本部",
    email: "admin@example.com",
    source: "profiles" as const,
  },
  isAuthenticated: true,
};

describe("survey-persistence", () => {
  it("normalizes survey input and forces manager users to their assigned school", () => {
    const survey = normalizeSurveyPersistenceInput(
      {
        schoolId: "school-other",
        title: "  保護者アンケート ",
        items: [
          {
            type: "SINGLE_SELECT",
            question: " 満足度 ",
            options: [" 良い ", ""],
            order: 1,
          },
        ],
      },
      managerAccess,
    );

    expect(survey.schoolId).toBe("school-own");
    expect(survey.title).toBe("保護者アンケート");
    expect(survey.items[0].options).toEqual(["良い"]);
  });

  it("uses the default school when a school id is not provided", () => {
    const survey = normalizeSurveyPersistenceInput(
      {
        schoolId: "",
        title: "アンケート",
        items: [{ type: "TEXT", question: "自由記述", order: 1 }],
      },
      adminAccess,
    );

    expect(survey.schoolId).toBe(DEFAULT_SCHOOL_ID);
  });

  it("rejects invalid survey inputs", () => {
    expect(() =>
      normalizeSurveyPersistenceInput(
        { schoolId: "school-own", title: " ", items: [] },
        managerAccess,
      ),
    ).toThrow("アンケート名を入力してください。");
    expect(() =>
      normalizeSurveyPersistenceInput(
        { schoolId: "school-own", title: "x", items: [] },
        managerAccess,
      ),
    ).toThrow("設問を1件以上設定してください。");
    expect(() =>
      normalizeSurveyPersistenceInput(
        {
          schoolId: "school-own",
          title: "x",
          items: [{ type: "TEXT", question: "", order: 1 }],
        },
        managerAccess,
      ),
    ).toThrow("1番目の設問文を入力してください。");
  });

  it("normalizes maxSelect values for multi-select questions", () => {
    const survey = normalizeSurveyPersistenceInput(
      {
        schoolId: "school-own",
        title: "アンケート",
        items: [
          {
            type: "MULTI_SELECT",
            question: "良かった点",
            maxSelect: 3.8,
            options: ["説明"],
            order: 1,
          },
        ],
      },
      managerAccess,
    );

    expect(survey.items[0].maxSelect).toBe(3);
  });

  it("renumbers survey item order from the submitted array sequence", () => {
    const survey = normalizeSurveyPersistenceInput(
      {
        schoolId: "school-own",
        title: "アンケート",
        items: [
          {
            id: "q3",
            type: "TEXT",
            question: "三番目から先頭へ移動した設問",
            placeholder: "例: 熊本高校",
            order: 3,
          },
          {
            id: "q1",
            type: "SINGLE_SELECT",
            question: "元の一番目",
            options: ["はい"],
            order: 1,
          },
        ],
      },
      managerAccess,
    );

    expect(survey.items.map((item) => ({ id: item.id, order: item.order }))).toEqual([
      { id: "q3", order: 1 },
      { id: "q1", order: 2 },
    ]);
    expect(survey.items[0].placeholder).toBe("例: 熊本高校");
  });

  it("persists a survey and replaces its items", async () => {
    const prisma = {
      user: {
        upsert: vi.fn(async () => ({ id: "system-user" })),
      },
      school: {
        findUnique: vi.fn(async () => ({ id: "school-own" })),
        upsert: vi.fn(async () => ({ id: "school-own" })),
      },
      survey: {
        create: vi.fn(async () => ({ id: "survey-new" })),
        update: vi.fn(async () => ({ id: "survey-1" })),
      },
      surveyItem: {
        deleteMany: vi.fn(async () => ({})),
        createMany: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (operations) => Promise.all(operations)),
    };

    await persistSurvey(
      prisma as never,
      normalizeSurveyPersistenceInput(
        {
          id: "survey-1",
          schoolId: "school-own",
          title: "アンケート",
          items: [
            {
              type: "TEXT",
              question: "自由記述",
              placeholder: "例: 熊本高校",
              order: 1,
            },
          ],
        },
        managerAccess,
      ),
    );

    expect(prisma.survey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "survey-1" },
        data: expect.objectContaining({ schoolId: "school-own" }),
      }),
    );
    expect(prisma.survey.create).not.toHaveBeenCalled();
    expect(prisma.surveyItem.deleteMany).toHaveBeenCalledWith({
      where: { surveyId: "survey-1" },
    });
    expect(prisma.surveyItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          surveyId: "survey-1",
          question: "自由記述",
          placeholder: "例: 熊本高校",
        }),
      ],
    });
  });

  it("creates a new survey when the survey id is new", async () => {
    const prisma = {
      user: {
        upsert: vi.fn(async () => ({ id: "system-user" })),
      },
      school: {
        findUnique: vi.fn(async () => ({ id: "school-own" })),
        upsert: vi.fn(async () => ({ id: "school-own" })),
      },
      survey: {
        create: vi.fn(async () => ({ id: "survey-created" })),
        update: vi.fn(async () => ({ id: "survey-updated" })),
      },
      surveyItem: {
        deleteMany: vi.fn(async () => ({})),
        createMany: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (operations) => Promise.all(operations)),
    };

    const savedSurvey = await persistSurvey(
      prisma as never,
      normalizeSurveyPersistenceInput(
        {
          id: "new",
          schoolId: "school-own",
          title: "新規アンケート",
          items: [{ type: "TEXT", question: "自由記述", order: 1 }],
        },
        managerAccess,
      ),
    );

    expect(savedSurvey).toEqual({ id: "survey-created" });
    expect(prisma.survey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: "school-own",
        title: "新規アンケート",
      }),
    });
    expect(prisma.survey.update).not.toHaveBeenCalled();
    expect(prisma.surveyItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          surveyId: "survey-created",
          question: "自由記述",
        }),
      ],
    });
  });

  it("normalizes and persists survey responses as reviews", async () => {
    const prisma = {
      user: {
        upsert: vi.fn(async () => ({ id: "system-user" })),
      },
      school: {
        findUnique: vi.fn(async () => ({ id: "school-own" })),
        upsert: vi.fn(async () => ({ id: "school-own" })),
      },
      review: {
        create: vi.fn(async () => ({ id: "review-1" })),
      },
    };
    const input = normalizeSurveyResponseInput({
      schoolId: " school-own ",
      rating: 5,
      selectedReasons: [" 説明が丁寧 "],
      freeText: "よかったです",
      questionAnswers: [
        { questionId: "system-respondent-type", question: "ご回答者様を選択してください", type: "SINGLE_SELECT", value: "生徒ご本人様" },
        {
          questionId: " q1 ",
          question: " 通塾のきっかけ ",
          type: "SINGLE_SELECT",
          value: " 大学受験 ",
        },
        {
          questionId: "q2",
          question: "良かった点",
          type: "MULTI_SELECT",
          value: [" 質問しやすい ", ""],
        },
        null as never,
        {
          questionId: "",
          question: "無効",
          type: "TEXT",
          value: "無効",
        },
      ],
      generatedReviews: ["口コミ案"],
    });

    expect(input.questionAnswers).toEqual([
      { questionId: "system-respondent-type", question: "ご回答者様を選択してください", type: "SINGLE_SELECT", value: "生徒ご本人様" },
      {
        questionId: "q1",
        question: "通塾のきっかけ",
        type: "SINGLE_SELECT",
        value: "大学受験",
      },
      {
        questionId: "q2",
        question: "良かった点",
        type: "MULTI_SELECT",
        value: ["質問しやすい"],
      },
    ]);

    await persistSurveyResponse(prisma, input);

    expect(prisma.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: "school-own",
        source: "SURVEY",
        status: "PENDING",
        comment: "口コミ案",
        aiReplyDraft: "回答ありがとうございます。",
        rating: 5,
        generatedPatterns: ["口コミ案"],
        surveyAnswers: expect.objectContaining({
          questionAnswers: input.questionAnswers,
        }),
      }),
    });
  });

  it("rejects missing respondent answers instead of saving an empty list", () => {
    expect(() => normalizeSurveyResponseInput({
      schoolId: "school-own",
      questionAnswers: "invalid" as never,
    })).toThrow("ご回答者様");
    expect(() => normalizeSurveyResponseInput({ schoolId: "school-own" })).toThrow("ご回答者様");
  });

  it("persists the parent's real generated text and role without claiming Google publication", async () => {
    const prisma = {
      user: { upsert: vi.fn() }, school: { findUnique: vi.fn(async () => ({ id: "school-1", name: "実校舎", schoolSetting: null })), upsert: vi.fn() },
      review: { create: vi.fn() },
    };
    const input = normalizeSurveyResponseInput({ schoolId: "school-1", rating: 4, generatedReviews: ["子どもが質問しやすいと話しています。"], questionAnswers: [{ questionId: "system-respondent-type", question: "ご回答者様を選択してください", type: "SINGLE_SELECT", value: "保護者様" }] });
    await persistSurveyResponse(prisma, input);
    expect(prisma.review.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: "SURVEY", status: "PENDING", authorName: "アンケート回答者（保護者）", comment: input.generatedReviews[0], surveyAnswers: expect.objectContaining({ respondentType: "PARENT" }) }) });
    expect(prisma.review.create).not.toHaveBeenCalledWith({ data: expect.objectContaining({ googleReviewId: expect.anything() }) });
  });

  it("does not save empty cards or claim success when AI draft generation fails", async () => {
    const { generateReviewReplyDraft } = await import("./gbp-review-draft");
    const prisma = {
      user: { upsert: vi.fn() }, school: { findUnique: vi.fn(async () => ({ id: "school-1", name: "実校舎", schoolSetting: null })), upsert: vi.fn() },
      review: { create: vi.fn() },
    };
    const input = normalizeSurveyResponseInput({ schoolId: "school-1", questionAnswers: [{ questionId: "system-respondent-type", question: "ご回答者様を選択してください", type: "SINGLE_SELECT", value: "生徒ご本人様" }] });
    await expect(persistSurveyResponse(prisma, input)).rejects.toThrow("生成された口コミ本文");
    vi.mocked(generateReviewReplyDraft).mockRejectedValueOnce(new Error("AI unavailable"));
    await expect(persistSurveyResponse(prisma, { ...input, generatedReviews: ["回答の本文です。"] })).rejects.toThrow("AI unavailable");
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("rejects a missing school without creating dummy school or review records", async () => {
    const prisma = {
      user: {
        upsert: vi.fn(async () => ({ id: "system-user" })),
      },
      school: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ id: "school-missing" })),
      },
      review: {
        create: vi.fn(async () => ({ id: "review-1" })),
      },
    };

    await expect(persistSurveyResponse(
      prisma,
      normalizeSurveyResponseInput({ schoolId: "school-missing", questionAnswers: [{ questionId: "system-respondent-type", question: "ご回答者様を選択してください", type: "SINGLE_SELECT", value: "保護者様" }] }),
    )).rejects.toThrow("保存先の校舎情報");
    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.school.upsert).not.toHaveBeenCalled();
    expect(prisma.review.create).not.toHaveBeenCalled();
  });

  it("ensures the default school when no school id is passed", async () => {
    const prisma = {
      user: {
        upsert: vi.fn(async () => ({ id: "system-user" })),
      },
      school: {
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ id: DEFAULT_SCHOOL_ID })),
      },
    };

    const school = await ensureSchoolForPersistence(prisma, "");

    expect(school.id).toBe(DEFAULT_SCHOOL_ID);
    expect(prisma.school.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DEFAULT_SCHOOL_ID },
      }),
    );
  });

  it("maps raw database errors to Japanese messages", () => {
    expect(
      toJapanesePersistenceError(
        new Error("Foreign key constraint violated on the constraint: Survey_schoolId_fkey"),
        "保存できませんでした。",
      ),
    ).toBe(
      "保存先の校舎情報を確認できませんでした。時間をおいて再度お試しください。",
    );
    expect(
      toJapanesePersistenceError("failed", "保存できませんでした。"),
    ).toBe("保存できませんでした。");
    expect(
      toJapanesePersistenceError(
        new Error("Unique constraint failed on the fields: (`googlePlaceId`)"),
        "保存できませんでした。",
      ),
    ).toBe("同じ内容のデータがすでに登録されています。入力内容を確認してください。");
    expect(
      toJapanesePersistenceError(
        new Error("schoolId is required."),
        "保存できませんでした。",
      ),
    ).toBe("校舎情報を自動設定できませんでした。画面を再読み込みしてから再度お試しください。");
    expect(
      toJapanesePersistenceError(
        new Error("Prisma connection failed"),
        "保存できませんでした。",
      ),
    ).toBe("保存できませんでした。");
    expect(
      toJapanesePersistenceError(
        new Error("アンケート名を入力してください。"),
        "保存できませんでした。",
      ),
    ).toBe("アンケート名を入力してください。");
  });
});
