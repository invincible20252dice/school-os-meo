import { describe, expect, it } from "vitest";
import { buildMockInstagramSyncPreview } from "./mock-instagram-sync";

describe("mock-instagram-sync", () => {
  it("shows the Instagram to AI rewrite to GBP post flow without side effects", async () => {
    const preview = await buildMockInstagramSyncPreview();

    expect(preview.school.name).toBe("青葉ゼミナール 本校");
    expect(preview.instagram.caption).toContain("#夏期講習");
    expect(preview.formattedText).not.toContain("#夏期講習");
    expect(preview.gbpPostPayload.locationId).toBe("mock-gbp-location-001");
    expect(preview.mockResult.gbpPostId).toBe("mock-gbp-post-001");
    expect(preview.safety).toContain("Mock");
  });
});
