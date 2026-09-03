import { describe, expect, it } from "vitest";
import { GET, PATCH, POST } from "./route";
import {
  GET as singularGET,
  PATCH as singularPATCH,
  POST as singularPOST,
} from "../prompt/route";

describe("/api/dashboard/settings/prompts", () => {
  it("re-exports the singular prompt settings handlers", () => {
    expect(GET).toBe(singularGET);
    expect(PATCH).toBe(singularPATCH);
    expect(POST).toBe(singularPOST);
  });
});
