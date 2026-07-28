import { describe, expect, it, vi } from "vitest";
import {
  normalizeSurveyPersistenceInput,
  normalizeSurveyResponseInput,
  persistSurvey,
  persistSurveyResponse,
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

  it("rejects invalid survey inputs", () => {
    expect(() =>
      normalizeSurveyPersistenceInput(
        { schoolId: "", title: "x", items: [] },
        adminAccess,
      ),
    ).toThrow("schoolId is required.");
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

  it("persists a survey and replaces its items", async () => {
    const prisma = {
      survey: {
        upsert: vi.fn(async () => ({ id: "survey-1" })),
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
          items: [{ type: "TEXT", question: "自由記述", order: 1 }],
        },
        managerAccess,
      ),
    );

    expect(prisma.survey.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "survey-1" },
      }),
    );
    expect(prisma.surveyItem.deleteMany).toHaveBeenCalledWith({
      where: { surveyId: "survey-1" },
    });
    expect(prisma.surveyItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          surveyId: "survey-1",
          question: "自由記述",
        }),
      ],
    });
  });

  it("normalizes and persists survey responses as reviews", async () => {
    const prisma = {
      school: {
        findUnique: vi.fn(async () => ({ id: "school-own" })),
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
      generatedReviews: ["口コミ案"],
    });

    await persistSurveyResponse(prisma, input);

    expect(prisma.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: "school-own",
        source: "SURVEY",
        status: "GENERATED",
        rating: 5,
        generatedPatterns: ["口コミ案"],
      }),
    });
  });

  it("rejects responses for unknown schools", async () => {
    await expect(
      persistSurveyResponse(
        {
          school: { findUnique: vi.fn(async () => null) },
          review: { create: vi.fn() },
        },
        normalizeSurveyResponseInput({ schoolId: "school-missing" }),
      ),
    ).rejects.toThrow("対象校舎が見つかりません。");
  });
});
