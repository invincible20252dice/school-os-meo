import { describe, expect, it } from "vitest";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  normalizeGoogleReviewUrl,
  resolveGoogleReviewUrl,
} from "./google-review-url";

describe("google-review-url", () => {
  it("normalizes http review URLs and rejects invalid values", () => {
    expect(
      normalizeGoogleReviewUrl(
        " https://search.google.com/local/writereview?placeid=abc ",
      ),
    ).toBe("https://search.google.com/local/writereview?placeid=abc");
    expect(normalizeGoogleReviewUrl("javascript:alert(1)")).toBe("");
    expect(normalizeGoogleReviewUrl("not a url")).toBe("");
    expect(
      normalizeGoogleReviewUrl("https://search.google.com/local/writereview"),
    ).toBe("");
    expect(
      normalizeGoogleReviewUrl(
        "https://search.google.com/local/writereview?placeid=manual-f0f5e2ce-8579-4738-9c1b-c3065738323f",
      ),
    ).toBe("");
  });

  it("prefers the saved setting URL over school and place id values", () => {
    expect(
      resolveGoogleReviewUrl({
        settingReviewUrl:
          "https://search.google.com/local/writereview?placeid=custom",
        schoolGoogleMapsUrl:
          "https://search.google.com/local/writereview?placeid=school",
        googlePlaceId: "place-id",
      }),
    ).toBe("https://search.google.com/local/writereview?placeid=custom");
  });

  it("falls back to school url and then iSchool review url", () => {
    expect(
      resolveGoogleReviewUrl({
        schoolGoogleMapsUrl:
          "https://search.google.com/local/writereview?placeid=school",
        googlePlaceId: "place-id",
      }),
    ).toBe("https://search.google.com/local/writereview?placeid=school");
    expect(resolveGoogleReviewUrl({ googlePlaceId: "place id" })).toBe(
      DEFAULT_GOOGLE_REVIEW_URL,
    );
    expect(resolveGoogleReviewUrl({})).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });

  it("does not use an incomplete Google write-review URL as a destination", () => {
    expect(
      resolveGoogleReviewUrl({
        settingReviewUrl: "https://search.google.com/local/writereview",
      }),
    ).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });

  it("does not build a Google write-review URL from an internal placeholder id", () => {
    expect(
      resolveGoogleReviewUrl({
        schoolGoogleMapsUrl:
          "https://search.google.com/local/writereview?placeid=manual-f0f5e2ce-8579-4738-9c1b-c3065738323f",
        googlePlaceId: "manual-f0f5e2ce-8579-4738-9c1b-c3065738323f",
      }),
    ).toBe(DEFAULT_GOOGLE_REVIEW_URL);
  });
});
