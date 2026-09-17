import { describe, expect, it } from "vitest";
import * as gbpReplyRoute from "../../../gbp/reply/route";
import { GET, POST } from "./route";

describe("/api/dashboard/reviews/reply", () => {
  it("re-exports the reply handlers used by the reviews dashboard", () => {
    expect(GET).toBe(gbpReplyRoute.GET);
    expect(POST).toBe(gbpReplyRoute.POST);
  });
});
