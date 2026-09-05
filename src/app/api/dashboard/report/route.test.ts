import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { GET as reportsGET } from "../reports/route";

describe("/api/dashboard/report", () => {
  it("re-exports the reports API handler", () => {
    expect(GET).toBe(reportsGET);
  });
});
