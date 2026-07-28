import { describe, expect, it } from "vitest";
import { buildManualReviewTest } from "./manual-review-test";

describe("manual-review-test", () => {
  it("builds a dry-run new review event for dashboard and LINE preview", async () => {
    const result = await buildManualReviewTest({
      googleReviewId: "manual_review_1",
      rating: 4,
      reviewText: "面談が丁寧でした。",
    });

    expect(result.dryRun).toBe(true);
    expect(result.summary).toEqual({
      received: 1,
      saved: 1,
      notified: 1,
      skipped: 0,
    });
    expect(result.review.googleReviewId).toBe("manual_review_1");
    expect(result.savedReview.aiReplyText).toContain("青葉ゼミナール 本校");
    expect(result.lineNotification.altText).toContain("新着口コミ");
    expect(JSON.stringify(result.lineNotification)).toContain("返信を確認する");
  });

  it("builds defaults for manual review dry-runs", async () => {
    const result = await buildManualReviewTest();

    expect(result.review.googleReviewId).toMatch(/^manual_test_review_/);
    expect(result.review.googlePlaceId).toBe("demo-place-id");
    expect(result.review.gbpLocationId).toBe("locations/aoba-yokohama-main");
    expect(result.review.reviewerName).toBe("手動テスト保護者");
    expect(result.review.rating).toBe(5);
    expect(result.review.reviewUrl).toBe("https://search.google.com/local/reviews");
    expect(result.savedReview.id).toMatch(/^review_manual_/);
    expect(result.savedReview.stars).toBe("★★★★★");
  });
});
