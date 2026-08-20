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
  },
}));

describe("GET /api/public/survey-school", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the public school name and saved Google review URL", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/public/survey-school?schoolId=school-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.school.name).toBe("大学受験専門塾 iスクール予備校");
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
});
