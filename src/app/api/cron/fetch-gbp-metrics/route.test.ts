import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/gbp-metrics", () => ({
  fetchAndStoreGbpMetrics: vi.fn(async () => ({
    schools: 2,
    fetched: 1,
    stored: 1,
    skipped: 1,
  })),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("POST /api/cron/fetch-gbp-metrics", () => {
  it("rejects requests when cron secret does not match", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/fetch-gbp-metrics", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("runs metric collection when authorized", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const metrics = await import("@/lib/gbp-metrics");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/fetch-gbp-metrics", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ schools: 2, fetched: 1, stored: 1, skipped: 1 });
    expect(metrics.fetchAndStoreGbpMetrics).toHaveBeenCalledOnce();
  });

  it("runs without authorization headers when no cron secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/fetch-gbp-metrics", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns 500 when metric collection fails", async () => {
    delete process.env.CRON_SECRET;
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const metrics = await import("@/lib/gbp-metrics");
    vi.mocked(metrics.fetchAndStoreGbpMetrics).mockRejectedValueOnce(
      new Error("metrics failed"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/fetch-gbp-metrics", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("GBPインサイトの取得に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
