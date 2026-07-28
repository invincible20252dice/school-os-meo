import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/mock/sync-instagram", () => {
  it("returns a mock Instagram sync preview without external side effects", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.safety).toContain("Mock");
    expect(body.instagram.caption).toContain("#夏期講習");
    expect(body.formattedText).not.toContain("#夏期講習");
    expect(body.gbpPostPayload.locationId).toBe("mock-gbp-location-001");
  });
});
