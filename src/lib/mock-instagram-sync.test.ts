import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockInstagramSyncPreview } from "./mock-instagram-sync";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("mock-instagram-sync", () => {
  it("never invokes AI or a provider even with an API key configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "synthetic-not-a-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ output_text: "external response" })));
    const preview = await buildMockInstagramSyncPreview();
    expect(fetch).not.toHaveBeenCalled();
    expect(preview.formattedText).not.toBe("external response");
  });
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
