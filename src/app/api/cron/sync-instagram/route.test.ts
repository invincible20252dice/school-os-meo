import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/instagram-sync", () => ({
  syncInstagramPosts: vi.fn(async () => ({
    settings: 1,
    fetched: 1,
    posted: 1,
    skipped: 0,
  })),
}));

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("POST /api/cron/sync-instagram", () => {
  it("rejects requests when cron secret does not match", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/sync-instagram", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );

    expect(response.status).toBe(401);
  });

  it("runs Instagram sync when authorized", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const sync = await import("@/lib/instagram-sync");
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/sync-instagram", {
        method: "POST",
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ settings: 1, fetched: 1, posted: 1, skipped: 0 });
    expect(sync.syncInstagramPosts).toHaveBeenCalledOnce();
  });

  it.each([undefined, "", "   "])("rejects missing/blank configured secret: %j", async secret => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/sync-instagram", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    const sync = await import("@/lib/instagram-sync");
    expect(sync.syncInstagramPosts).not.toHaveBeenCalled();
  });

  it("returns 500 when Instagram sync fails", async () => {
    process.env.CRON_SECRET = "cron-secret";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const sync = await import("@/lib/instagram-sync");
    vi.mocked(sync.syncInstagramPosts).mockRejectedValueOnce(
      new Error("sync failed"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/cron/sync-instagram", {
        method: "POST", headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Instagram投稿のGBP同期に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
