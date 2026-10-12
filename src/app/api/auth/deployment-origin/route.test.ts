import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const host = "school-os-fixed-team.vercel.app";
const origin = `https://${host}`;
function request(value: string | null = origin, suffix = "", extra = {}) {
  return new Request(`https://untrusted-host.invalid/api/auth/deployment-origin${suffix}`, {
    method: "POST", headers: { ...(value === null ? {} : { Origin: value }), ...extra },
  });
}
beforeEach(() => {
  vi.stubEnv("AUTH_ALLOW_EXACT_VERCEL_DEPLOYMENT_ORIGIN", "true");
  vi.stubEnv("VERCEL_URL", host);
});
afterEach(() => vi.unstubAllEnvs());
describe("deployment-only OAuth origin policy", () => {
  it("allows only the exact trusted deployment origin without trusting request host", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ origin });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
  it.each([undefined, "", "false", "1", "TRUE"])("defaults closed for mode %s", async mode => {
    vi.stubEnv("AUTH_ALLOW_EXACT_VERCEL_DEPLOYMENT_ORIGIN", mode);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ origin: null });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([undefined, "", "https://" + host, host + "/", host + ":443", host + "?x=1", host + "#x", "user@" + host, " " + host, "*.vercel.app", "evil.invalid", "foo.vercel.app.evil.invalid"])("rejects missing/malformed server metadata %s", async value => {
    vi.stubEnv("VERCEL_URL", value);
    expect((await POST(request())).status).toBe(403);
  });
  it.each([null, "null", "http://" + host, origin + "/", origin + ":443", origin + "/auth/callback", origin + "?x=1", origin + "#x", "https://other.vercel.app", "https://" + host + ".evil.invalid", "https://user@" + host])("rejects non-exact Origin %s", async value => {
    expect((await POST(request(value))).status).toBe(403);
  });
  it("does not accept query or Host/forwarded header substitutes", async () => {
    const response = await POST(request(null, `?origin=${encodeURIComponent(origin)}`, {
      Host: host, "X-Forwarded-Host": host, "X-Forwarded-Proto": "https",
    }));
    expect(response.status).toBe(403);
  });
});
