import { describe, expect, it } from "vitest";
import { buildAiReviewReplyDemo } from "./ai-review-demo";

describe("ai-review-demo", () => {
  it("builds a visible demo of AI reply and LINE notification state", () => {
    const demo = buildAiReviewReplyDemo();

    expect(demo.review.schoolName).toBe("青葉ゼミナール 本校");
    expect(demo.review.rating).toBe(5);
    expect(demo.aiReplyText).toContain("ありがとうございます");
    expect(demo.savedReview.status).toBe("GENERATED");
    expect(demo.lineNotification.altText).toContain("新着口コミ");
    expect(JSON.stringify(demo.lineNotification)).toContain("返信を確認する");
  });
});
