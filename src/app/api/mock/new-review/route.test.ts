import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/mock/new-review", () => {
  it("returns a dry-run review and LINE notification payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/mock/new-review", {
        method: "POST",
        body: JSON.stringify({
          googleReviewId: "manual_review_route_1",
          reviewText: "説明がわかりやすかったです。",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(body.review.googleReviewId).toBe("manual_review_route_1");
    expect(body.summary.notified).toBe(1);
    expect(body.lineNotification.altText).toContain("新着口コミ");
  });
});
