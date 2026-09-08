import { describe, expect, it } from "vitest";
import { buildMockInstagramSyncPreview } from "./mock-instagram-sync";

describe("mock-instagram-sync", () => {
  it("shows the Instagram to AI rewrite to GBP post flow without side effects", async () => {
    const preview = await buildMockInstagramSyncPreview();

    expect(preview.school.name).toBe("iスクール予備校");
    expect(preview.instagram.caption).toContain("#熊本");
    expect(preview.formattedText).not.toContain("#熊本");
    expect(preview.gbpPostPayload.locationId).toBe("locations/6467241578381534467");
    expect(preview.mockResult.gbpPostId).toBe("mock-gbp-post-001");
    expect(preview.safety).toContain("プレビュー");
  });

  it("accepts DB-backed school data for the preview payload", async () => {
    const preview = await buildMockInstagramSyncPreview({
      school: {
        id: "school-2",
        name: "大学受験専門塾 iスクール予備校",
        gbpLocationId: "locations/live",
      },
    });

    expect(preview.school.name).toBe("大学受験専門塾 iスクール予備校");
    expect(preview.gbpPostPayload.locationId).toBe("locations/live");
    expect(preview.formattedText).toContain("大学受験専門塾 iスクール予備校");
  });
});
