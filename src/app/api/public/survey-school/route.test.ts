import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GOOGLE_REVIEW_URL } from "@/lib/google-review-url";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: {
      findUnique: vi.fn(async () => ({
        id: "school-1",
        name: "大学受験専門塾 iスクール予備校",
        googlePlaceId: "place-school",
        googleMapsUrl:
          "https://search.google.com/local/writereview?placeid=school-url",
        schoolSetting: {
          googleReviewUrl:
            "https://search.google.com/local/writereview?placeid=setting-url",
        },
      })),
    },
    survey: {
      findFirst: vi.fn(async () => ({
        id: "survey-1",
        title: "予備校下通り校",
        requiredKeywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
        minCharCount: 100,
        maxCharCount: 300,
        benefitType: "",
        benefitShowTiming: "",
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
      })),
    },
  },
}));

describe("GET /api/public/survey-school", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the public school name and saved Google review URL", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1&surveyId=survey-1",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.school.name).toBe("大学受験専門塾 iスクール予備校");
    expect(body.survey).toMatchObject({
      id: "survey-1",
      title: "予備校下通り校",
      requiredKeywords: "下通り, 街, 個別指導, 大学受験, 安心な価格",
    });
    expect(body.googleReviewUrl).toBe(
      "https://search.google.com/local/writereview?placeid=setting-url",
    );
  });

  it("falls back to the iSchool review URL when school id is missing", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.googleReviewUrl).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });

  it("returns the iSchool review URL when the school is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.school.findUnique).mockResolvedValueOnce(null);

    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.googleReviewUrl).toBe(DEFAULT_GOOGLE_REVIEW_URL);
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

  it("queries surveys by the requested survey id and school id", async () => {
    const { prisma } = await import("@/lib/prisma");

    await GET(
      new Request(
        "https://app.example.com/api/public/survey-school?schoolId=school-1&surveyId=survey-1",
      ),
    );

    expect(prisma.survey.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "survey-1",
          schoolId: "school-1",
          isValid: true,
        },
      }),
    );
  });
});
