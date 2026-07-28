import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerReviewTest } from "./trigger-review-test";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("triggerReviewTest", () => {
  it("saves a dummy review and sends LINE using SchoolSetting", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "x-line-request-id": "line-request-1" },
        }),
    );
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          lineChannelAccessToken: "line-token",
          lineDestinationId: "line-group",
          school: { id: "school-1", name: "青葉ゼミナール 本校" },
        })),
      },
      review: {
        create: vi.fn(async () => ({ id: "review-1" })),
      },
    };

    const result = await triggerReviewTest({
      prisma,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        saved: true,
        notified: true,
        reviewId: "review-1",
        line: expect.objectContaining({
          status: 200,
          requestId: "line-request-1",
        }),
        diagnostics: expect.objectContaining({
          lineApi: "LINE API accepted: 200",
        }),
      }),
    );
    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-1",
          rating: 5,
          status: "GENERATED",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("returns an actionable message when LINE settings are missing", async () => {
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          lineChannelAccessToken: "",
          lineDestinationId: "",
          school: { id: "school-1", name: "青葉ゼミナール 本校" },
        })),
      },
      review: {
        create: vi.fn(async () => ({ id: "review-1" })),
      },
    };

    const result = await triggerReviewTest({
      prisma,
      fetchImpl: vi.fn(),
    });

    expect(result.ok).toBe(false);
    expect(result.saved).toBe(true);
    expect(result.notified).toBe(false);
    expect(result.message).toContain("LINEトークン");
  });

  it("uses input school values and environment LINE settings when SchoolSetting is absent", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "env-line-token";
    process.env.LINE_DEFAULT_TO_ID = "U1234567890";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const fetchMock = vi.fn(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "x-line-request-id": "line-request-1" },
        }),
    );
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => null),
      },
      review: {
        create: vi.fn(async () => ({ id: "review-1" })),
      },
    };

    const result = await triggerReviewTest({
      input: {
        schoolId: "school-input",
        schoolName: "青葉ゼミナール 駅前校",
        reviewerName: "保護者B",
        rating: 3,
        reviewText: "確認したい点があります。",
      },
      prisma,
      fetchImpl: fetchMock,
    });

    expect(prisma.schoolSetting.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { schoolId: "school-input" },
      }),
    );
    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          schoolId: "school-input",
          parentName: "保護者B",
          rating: 3,
          originalText: "確認したい点があります。",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        saved: true,
        notified: true,
      }),
    );
  });

  it("ignores masked tokens before falling back to environment values", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = "env-line-token";
    process.env.LINE_DEFAULT_TO_ID = "line-group";
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const prisma = {
      schoolSetting: {
        findFirst: vi.fn(async () => ({
          schoolId: "school-1",
          lineChannelAccessToken: "LINE_CHANNEL_TOKEN_********",
          lineDestinationId: "C****************",
          school: null,
        })),
      },
      review: {
        create: vi.fn(async () => ({ id: "review-1" })),
      },
    };

    const result = await triggerReviewTest({
      prisma,
      fetchImpl: fetchMock,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer env-line-token",
        }),
      }),
    );
  });
});
