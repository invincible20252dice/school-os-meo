import { afterEach, describe, expect, it, vi } from "vitest";
import { syncInstagramPosts } from "./instagram-sync";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("instagram-sync", () => {
  it("syncs unsynced Instagram media to GBP and records history", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.GBP_LOCAL_POSTS_API_URL = "https://gbp.example.com/localPosts";
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";

    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => [
          {
            id: "setting_1",
            schoolId: "school_1",
            instagramAccessToken: "ig-token",
            instagramBusinessAccountId: "business_1",
            autoSyncEnabled: true,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              gbpLocationId: "location_1",
            },
          },
        ]),
        update: vi.fn(async () => undefined),
      },
      syncedPost: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "synced_1", ...data })),
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "ig_1",
              caption: "夏期講習スタート #塾",
              media_type: "IMAGE",
              media_url: "https://example.com/image.jpg",
              permalink: "https://instagram.com/p/1",
              timestamp: "2026-07-22T01:00:00+0000",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "gbp_post_1",
        }),
      );

    const summary = await syncInstagramPosts({
      prisma,
      fetchImpl: fetchMock,
    });

    expect(summary).toEqual({
      settings: 1,
      fetched: 1,
      posted: 1,
      skipped: 0,
    });
    expect(prisma.syncedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school_1",
          instagramMediaId: "ig_1",
          gbpPostId: "gbp_post_1",
        }),
      }),
    );
    expect(prisma.instagramSetting.update).toHaveBeenCalledWith({
      where: { id: "setting_1" },
      data: { lastSyncedAt: expect.any(Date) },
    });
  });

  it("syncs text-only media without an authorization header and uses GBP name fallback", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GBP_API_ACCESS_TOKEN;
    process.env.GBP_LOCAL_POSTS_API_URL = "https://gbp.example.com/localPosts";

    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => [
          {
            id: "setting_1",
            schoolId: "school_1",
            instagramAccessToken: "ig-token",
            instagramBusinessAccountId: "business_1",
            autoSyncEnabled: true,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              gbpLocationId: "location_1",
            },
          },
        ]),
        update: vi.fn(async () => undefined),
      },
      syncedPost: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async ({ data }) => ({ id: "synced_1", ...data })),
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "ig_1",
              caption: "自習室を開放しています",
              media_type: "IMAGE",
              media_url: null,
              permalink: "https://instagram.com/p/1",
              timestamp: "2026-07-22T01:00:00+0000",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          name: "accounts/1/locations/1/localPosts/post_1",
          searchUrl: "https://google.example.com/post_1",
        }),
      );

    const summary = await syncInstagramPosts({ prisma, fetchImpl: fetchMock });
    const gbpRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const gbpBody = JSON.parse(String(gbpRequest.body));

    expect(summary.posted).toBe(1);
    expect(gbpRequest.headers).toEqual({ "Content-Type": "application/json" });
    expect(gbpBody.media).toEqual([]);
    expect(prisma.syncedPost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gbpPostId: "accounts/1/locations/1/localPosts/post_1",
          gbpPostUrl: "https://google.example.com/post_1",
        }),
      }),
    );
  });

  it("skips already synced media", async () => {
    process.env.GBP_LOCAL_POSTS_API_URL = "https://gbp.example.com/localPosts";
    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => [
          {
            id: "setting_1",
            schoolId: "school_1",
            instagramAccessToken: "ig-token",
            instagramBusinessAccountId: "business_1",
            autoSyncEnabled: true,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              gbpLocationId: "location_1",
            },
          },
        ]),
        update: vi.fn(),
      },
      syncedPost: {
        findUnique: vi.fn(async () => ({ id: "synced_1" })),
        create: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: "ig_1",
            caption: "授業風景",
            media_type: "IMAGE",
            media_url: "https://example.com/image.jpg",
            permalink: "https://instagram.com/p/1",
            timestamp: "2026-07-22T01:00:00+0000",
          },
        ],
      }),
    );

    const summary = await syncInstagramPosts({ prisma, fetchImpl: fetchMock });

    expect(summary.posted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(prisma.syncedPost.create).not.toHaveBeenCalled();
  });

  it("returns an empty summary when no Instagram settings are enabled", async () => {
    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
      },
      syncedPost: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    const summary = await syncInstagramPosts({ prisma, fetchImpl: vi.fn() });

    expect(summary).toEqual({ settings: 0, fetched: 0, posted: 0, skipped: 0 });
  });

  it("requires the GBP local posts endpoint for new media", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GBP_LOCAL_POSTS_API_URL;
    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => [
          {
            id: "setting_1",
            schoolId: "school_1",
            instagramAccessToken: "ig-token",
            instagramBusinessAccountId: "business_1",
            autoSyncEnabled: true,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              gbpLocationId: "location_1",
            },
          },
        ]),
        update: vi.fn(),
      },
      syncedPost: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: "ig_1",
            caption: "授業風景",
            media_type: "IMAGE",
            media_url: "https://example.com/image.jpg",
            permalink: "https://instagram.com/p/1",
            timestamp: "2026-07-22T01:00:00+0000",
          },
        ],
      }),
    );

    await expect(syncInstagramPosts({ prisma, fetchImpl: fetchMock })).rejects.toThrow(
      "GBP_LOCAL_POSTS_API_URL is not configured.",
    );
  });

  it("requires a GBP location id before creating a GBP local post", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.GBP_LOCAL_POSTS_API_URL = "https://gbp.example.com/localPosts";
    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => [
          {
            id: "setting_1",
            schoolId: "school_1",
            instagramAccessToken: "ig-token",
            instagramBusinessAccountId: "business_1",
            autoSyncEnabled: true,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              gbpLocationId: null,
            },
          },
        ]),
        update: vi.fn(),
      },
      syncedPost: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(),
      },
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: "ig_1",
            caption: "授業風景",
            media_type: "IMAGE",
            media_url: null,
            permalink: "https://instagram.com/p/1",
            timestamp: "2026-07-22T01:00:00+0000",
          },
        ],
      }),
    );

    await expect(syncInstagramPosts({ prisma, fetchImpl: fetchMock })).rejects.toThrow(
      "School does not have gbpLocationId.",
    );
  });

  it("throws when GBP local post creation fails", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.GBP_LOCAL_POSTS_API_URL = "https://gbp.example.com/localPosts";
    const prisma = {
      instagramSetting: {
        findMany: vi.fn(async () => [
          {
            id: "setting_1",
            schoolId: "school_1",
            instagramAccessToken: "ig-token",
            instagramBusinessAccountId: "business_1",
            autoSyncEnabled: true,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              gbpLocationId: "location_1",
            },
          },
        ]),
        update: vi.fn(),
      },
      syncedPost: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(),
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "ig_1",
              caption: "授業風景",
              media_type: "VIDEO",
              media_url: "https://example.com/movie.mp4",
              permalink: "https://instagram.com/p/1",
              timestamp: "2026-07-22T01:00:00+0000",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 502 }));

    await expect(syncInstagramPosts({ prisma, fetchImpl: fetchMock })).rejects.toThrow(
      "GBP local post failed: 502",
    );
  });
});
