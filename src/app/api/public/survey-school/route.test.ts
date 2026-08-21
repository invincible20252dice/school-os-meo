import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
} from "@/lib/google-review-url";
import { GET } from "./route";

function buildSchool(overrides: Record<string, unknown> = {}) {
  return {
    id: "school-1",
    name: "大学受験専門塾 iスクール予備校",
    googlePlaceId: "place-school",
    googleMapsUrl:
      "https://search.google.com/local/writereview?placeid=school-url",
    schoolSetting: {
      googleReviewUrl:
        "https://search.google.com/local/writereview?placeid=setting-url",
    },
    ...overrides,
  };
}

function buildSurvey(overrides: Record<string, unknown> = {}) {
  return {
    id: "survey-1",
    schoolId: "school-1",
    title: "予備校下通り校",
    requiredKeywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
    minCharCount: 100,
    maxCharCount: 300,
    benefitType: "",
    benefitShowTiming: "",
    school: buildSchool(),
    items: [
      {
        id: "item-1",
        type: "MULTI_SELECT",
        question: "良かった点を選んでください",
        maxSelect: 3,
        options: ["個別指導", "大学受験", "安心な価格"],
        order: 1,
      },
    ],
    ...overrides,
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: vi.fn(),
    },
    survey: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe("GET /api/public/survey-school", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValue(buildSchool());
    vi.mocked(prisma.survey.findUnique).mockResolvedValue(buildSurvey());
    vi.mocked(prisma.survey.findFirst).mockResolvedValue(buildSurvey());
  });

  it("returns the public school name and saved Google review URL", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1&surveyId=survey-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.school.name).toBe("大学受験専門塾 iスクール予備校");
    expect(body.schoolName).toBe("大学受験専門塾 iスクール予備校");
    expect(body.survey).toMatchObject({
      id: "survey-1",
      title: "予備校下通り校",
      keywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
      requiredKeywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
      minChars: 100,
      maxChars: 300,
      reward: "なし",
    });
    expect(body.survey.items).toHaveLength(1);
    expect(body.survey.questions).toEqual(body.survey.items);
    expect(body.questions).toEqual(body.survey.items);
    expect(body.questions[0]).toMatchObject({
      id: "item-1",
      title: "良かった点を選んでください",
      question: "良かった点を選んでください",
      type: "multiple",
      internalType: "MULTI_SELECT",
      maxSelect: 3,
      options: ["個別指導", "大学受験", "安心な価格"],
    });
    expect(body.googleReviewUrl).toBe(
      "https://search.google.com/local/writereview?placeid=setting-url",
    );
  });

  it("normalizes all stored survey item types for the public JSON contract", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findUnique).mockResolvedValueOnce(
      buildSurvey({
        items: [
          {
            id: "q1",
            type: "SINGLE_SELECT",
            question: "通塾のきっかけを教えてください",
            maxSelect: null,
            options: ["学習習慣づけ", "定期テスト対策"],
            order: 1,
          },
          {
            id: "q2",
            type: "MULTI_SELECT",
            question: "良かったと感じた点を選んでください",
            maxSelect: 3,
            options: ["先生の説明", "質問しやすさ"],
            order: 2,
          },
          {
            id: "q3",
            type: "TEXT",
            question: "お子さまの変化を教えてください",
            maxSelect: null,
            options: [],
            order: 3,
          },
        ],
      }),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1&surveyId=survey-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions.map((question: { type: string }) => question.type)).toEqual([
      "single",
      "multiple",
      "text",
    ]);
    expect(body.questions[2].placeholder).toBe("自由記述入力欄");
  });

  it("returns JSON-string questions as a top-level pure questions array", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findUnique).mockResolvedValueOnce(
      buildSurvey({
        items: [],
        questionsJson: JSON.stringify([
          {
            id: "q-json",
            title: "選択設問",
            type: "multiple",
            maxSelect: 2,
            options: JSON.stringify(["説明が丁寧", "料金が明確", "通いやすい"]),
          },
        ]),
      }),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1&surveyId=survey-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions).toEqual([
      {
        id: "q-json",
        title: "選択設問",
        type: "multiple",
        question: "選択設問",
        internalType: "MULTI_SELECT",
        maxSelect: 2,
        options: ["説明が丁寧", "料金が明確", "通いやすい"],
        order: 1,
      },
    ]);
    expect(body.survey.questions).toEqual(body.questions);
  });

  it("falls back to the iSchool review URL when school id is missing", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.school.name).toBe(DEFAULT_PUBLIC_SCHOOL_NAME);
    expect(body.googleReviewUrl).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });

  it("returns the iSchool review URL when the school is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.school.name).toBe(DEFAULT_PUBLIC_SCHOOL_NAME);
    expect(body.googleReviewUrl).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });

  it("does not require an authorization header for public survey access", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.school.name).toBe("大学受験専門塾 iスクール予備校");
  });

  it("returns school information with empty questions when no active survey exists", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findFirst).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schoolName).toBe("大学受験専門塾 iスクール予備校");
    expect(body.survey).toBeNull();
    expect(body.questions).toEqual([]);
  });

  it("falls back to school Google Maps URL and then Place ID", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      name: "大学受験専門塾 iスクール予備校",
      googlePlaceId: "place-school",
      googleMapsUrl:
        "https://search.google.com/local/writereview?placeid=school-url",
      schoolSetting: {
        googleReviewUrl: null,
      },
    });
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce({
      id: "school-1",
      name: "大学受験専門塾 iスクール予備校",
      googlePlaceId: "place-school",
      googleMapsUrl: null,
      schoolSetting: null,
    });

    const schoolUrlResponse = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=school-1"),
    );
    const placeIdResponse = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=school-1"),
    );

    expect((await schoolUrlResponse.json()).googleReviewUrl).toBe(
      "https://search.google.com/local/writereview?placeid=school-url",
    );
    expect((await placeIdResponse.json()).googleReviewUrl).toBe(
      "https://search.google.com/local/writereview?placeid=place-school",
    );
  });

  it("queries surveys by the requested survey id without requiring school id match", async () => {
    const { prisma } = await import("@/lib/prisma");

    await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1&surveyId=survey-1",
      ),
    );

    expect(prisma.survey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "survey-1",
        },
        include: expect.objectContaining({
          items: expect.any(Object),
          school: expect.any(Object),
        }),
      }),
    );
  });

  it("accepts id as an alias for surveyId and loads that survey directly", async () => {
    const { prisma } = await import("@/lib/prisma");

    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school?id=survey-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.survey.id).toBe("survey-1");
    expect(prisma.survey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "survey-1" },
      }),
    );
  });

  it("can load a survey by survey id even when school id is omitted", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?surveyId=survey-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(1);
    expect(body.survey.id).toBe("survey-1");
  });

  it("keeps rendering questions when a survey-id lookup has no joined school row", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findUnique).mockResolvedValueOnce(
      buildSurvey({ school: undefined }),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?surveyId=survey-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schoolName).toBe(DEFAULT_PUBLIC_SCHOOL_NAME);
    expect(body.questions).toHaveLength(1);
  });

  it("loads the latest active survey for the requested school when survey id is absent", async () => {
    const { prisma } = await import("@/lib/prisma");

    await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=school-1"),
    );

    expect(prisma.survey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          schoolId: "school-1",
          isValid: true,
        },
        include: expect.objectContaining({
          items: expect.any(Object),
          school: expect.any(Object),
        }),
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("returns a safe fallback response when DB lookup fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.survey.findFirst).mockRejectedValueOnce(new Error("db failed"));

    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.school.name).toBe(DEFAULT_PUBLIC_SCHOOL_NAME);
    expect(body.googleReviewUrl).toBe(DEFAULT_GOOGLE_REVIEW_URL);
    consoleErrorSpy.mockRestore();
  });
});
