import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
afterEach(() => vi.unstubAllEnvs());
it.each(["", " ", "secret"])("fails closed without a matching configured secret: %s", async secret => {
  vi.stubEnv("CRON_SECRET", secret);
  expect((await POST(new Request("http://localhost/api/cron/analyze-aio", { method: "POST" }))).status).toBe(401);
});
it("keeps scheduled measurement disabled even when authenticated", async () => {
  vi.stubEnv("CRON_SECRET", "test-only");
  const response = await POST(new Request("http://localhost/api/cron/analyze-aio", { method: "POST", headers: { authorization: "Bearer test-only" } }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ enabled: false, stored: 0 });
});
