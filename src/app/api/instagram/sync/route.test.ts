import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("POST /api/instagram/sync", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs real Instagram sync flow", async () => {
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    const { POST } = await import("./route");

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.summary.posted).toBe(1);
    expect(syncInstagramPosts).toHaveBeenCalledOnce();
  });

  it("returns the thrown error message when Instagram sync fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    vi.mocked(syncInstagramPosts).mockRejectedValueOnce(
      new Error("Instagram token expired"),
    );
    const { POST } = await import("./route");

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      ok: false,
      message: "Instagram token expired",
    });
    consoleErrorSpy.mockRestore();
  });

  it("returns the generic message for non-Error failures", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { syncInstagramPosts } = await import("@/lib/instagram-sync");
    vi.mocked(syncInstagramPosts).mockRejectedValueOnce("unknown failure");
    const { POST } = await import("./route");

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Instagram実同期に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
