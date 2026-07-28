import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLatestInstagramMedia,
  normalizeInstagramMedia,
} from "./instagram";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("instagram", () => {
  it("normalizes Instagram media payloads", () => {
    const media = normalizeInstagramMedia({
      id: "ig_1",
      caption: "授業風景です #塾",
      media_type: "IMAGE",
      media_url: "https://example.com/image.jpg",
      permalink: "https://instagram.com/p/1",
      timestamp: "2026-07-22T01:00:00+0000",
    });

    expect(media).toEqual({
      instagramMediaId: "ig_1",
      caption: "授業風景です #塾",
      mediaType: "IMAGE",
      mediaUrl: "https://example.com/image.jpg",
      permalink: "https://instagram.com/p/1",
      postedAt: new Date("2026-07-22T01:00:00.000Z"),
    });
  });

  it("normalizes optional Instagram media fields with thumbnail fallback", () => {
    const media = normalizeInstagramMedia({
      id: "ig_2",
      caption: "  ",
      media_type: "VIDEO",
      thumbnail_url: "https://example.com/thumb.jpg",
      timestamp: "2026-07-22T01:00:00+0000",
    });

    expect(media).toEqual({
      instagramMediaId: "ig_2",
      caption: "",
      mediaType: "VIDEO",
      mediaUrl: "https://example.com/thumb.jpg",
      permalink: undefined,
      postedAt: new Date("2026-07-22T01:00:00.000Z"),
    });
  });

  it("fetches latest media from Meta Graph API", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            id: "ig_1",
            caption: "授業風景です",
            media_type: "IMAGE",
            media_url: "https://example.com/image.jpg",
            permalink: "https://instagram.com/p/1",
            timestamp: "2026-07-22T01:00:00+0000",
          },
        ],
      }),
    );

    const media = await fetchLatestInstagramMedia(
      {
        instagramBusinessAccountId: "business_1",
        instagramAccessToken: "ig-token",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/business_1/media?fields=id%2Ccaption%2Cmedia_type%2Cmedia_url%2Cthumbnail_url%2Cpermalink%2Ctimestamp&limit=5&access_token=ig-token",
    );
    expect(media).toHaveLength(1);
    expect(media[0].instagramMediaId).toBe("ig_1");
  });

  it("returns an empty list when Meta response data is not an array", async () => {
    const media = await fetchLatestInstagramMedia(
      {
        instagramBusinessAccountId: "business_1",
        instagramAccessToken: "ig-token",
      },
      vi.fn(async () => Response.json({ data: null })),
    );

    expect(media).toEqual([]);
  });

  it("throws when Meta media fetch fails", async () => {
    await expect(
      fetchLatestInstagramMedia(
        {
          instagramBusinessAccountId: "business_1",
          instagramAccessToken: "ig-token",
        },
        vi.fn(async () => new Response("{}", { status: 401 })),
      ),
    ).rejects.toThrow("Instagram media fetch failed: 401");
  });
});
