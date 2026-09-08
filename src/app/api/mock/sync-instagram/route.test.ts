import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/mock/sync-instagram", () => {
  it("returns a mock Instagram sync preview without external side effects", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.safety).toContain("プレビュー");
    expect(body.school.name).toBe("iスクール予備校");
    expect(body.instagram.caption).toContain("#熊本");
    expect(body.instagram.caption).not.toContain("横浜駅");
    expect(body.formattedText).not.toContain("#熊本");
    expect(body.gbpPostPayload.locationId).toBe("locations/6467241578381534467");
  });
});
