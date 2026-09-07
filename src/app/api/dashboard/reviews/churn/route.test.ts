import { describe, expect, it } from "vitest";

describe("/api/dashboard/reviews/churn", () => {
  it("reuses the churn-alert dashboard API handlers", async () => {
    const aliasRoute = await import("./route");
    const sourceRoute = await import("../../churn-alert/route");

    expect(aliasRoute.GET).toBe(sourceRoute.GET);
    expect(aliasRoute.PATCH).toBe(sourceRoute.PATCH);
  });
});
