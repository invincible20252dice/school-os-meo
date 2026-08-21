import { describe, expect, it } from "vitest";
import { buildSurveyPublicUrl } from "./survey-public-url";

describe("survey-public-url", () => {
  it("builds a public survey URL from the current origin and school id", () => {
    expect(
      buildSurveyPublicUrl("https://school-os-meo.vercel.app/", "school-1"),
    ).toBe("https://school-os-meo.vercel.app/survey/school-1");
  });

  it("adds the survey id when one is provided", () => {
    expect(
      buildSurveyPublicUrl(
        "https://school-os-meo.vercel.app",
        "school-1",
        "survey-1",
      ),
    ).toBe("https://school-os-meo.vercel.app/survey/school-1?surveyId=survey-1");
  });

  it("encodes school ids safely", () => {
    expect(buildSurveyPublicUrl("http://localhost:3030", " school 1 ")).toBe(
      "http://localhost:3030/survey/school%201",
    );
  });

  it("requires a base URL and school id", () => {
    expect(() => buildSurveyPublicUrl("", "school-1")).toThrow("基準URL");
    expect(() => buildSurveyPublicUrl("https://example.com", " ")).toThrow(
      "校舎ID",
    );
  });
});
