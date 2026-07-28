import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/aio-cron", () => ({
  analyzeAndStoreAioScores: vi.fn(async () => ({
    keywords: 3,
    analyzed: 3,
    stored: 3,
  })),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("POST /api/cron/analyze-aio", () => {
  it("rejects requests when cron secret does not match", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/analyze-aio", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("runs AIO analysis when authorized", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const aioCron = await import("@/lib/aio-cron");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/analyze-aio", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ keywords: 3, analyzed: 3, stored: 3 });
    expect(aioCron.analyzeAndStoreAioScores).toHaveBeenCalledOnce();
  });

  it("runs without authorization headers when no cron secret is configured", async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/analyze-aio", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
  });

  it("returns 500 when AIO analysis fails", async () => {
    delete process.env.CRON_SECRET;
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const aioCron = await import("@/lib/aio-cron");
    vi.mocked(aioCron.analyzeAndStoreAioScores).mockRejectedValueOnce(
      new Error("analysis failed"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/analyze-aio", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("AIOスコア分析に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
