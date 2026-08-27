import { describe, expect, it } from "vitest";
import * as gbpReplyRoute from "../../gbp/reply/route";
import { GET, POST } from "./route";

describe("/api/reviews/reply", () => {
  it("re-exports the GBP reply handlers used by the dashboard", () => {
    expect(GET).toBe(gbpReplyRoute.GET);
    expect(POST).toBe(gbpReplyRoute.POST);
  });
});

