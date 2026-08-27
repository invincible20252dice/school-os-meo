import { describe, expect, it } from "vitest";
import * as surveysRoute from "../../surveys/route";
import { GET, POST } from "./route";

describe("/api/dashboard/surveys", () => {
  it("re-exports the canonical survey handlers used by the dashboard", () => {
    expect(GET).toBe(surveysRoute.GET);
    expect(POST).toBe(surveysRoute.POST);
  });
});

