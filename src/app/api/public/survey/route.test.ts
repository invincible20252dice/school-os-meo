import { describe, expect, it } from "vitest";

describe("GET /api/public/survey", () => {
  it("reuses the public survey-school handler", async () => {
    const surveyRoute = await import("./route");
    const surveySchoolRoute = await import("../survey-school/route");

    expect(surveyRoute.GET).toBe(surveySchoolRoute.GET);
  });
});
