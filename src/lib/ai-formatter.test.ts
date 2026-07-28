import { afterEach, describe, expect, it, vi } from "vitest";
import { formatInstagramCaptionForGbp } from "./ai-formatter";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("ai-formatter", () => {
  it("removes hashtags and reduces noisy text without OpenAI", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await formatInstagramCaptionForGbp({
      schoolName: "青葉ゼミナール",
      caption:
        "夏期講習スタート🔥🔥 苦手単元を一緒に復習します！ #塾 #夏期講習 #個別指導",
    });

    expect(result).toContain("夏期講習スタート");
    expect(result).not.toContain("#塾");
    expect(result).not.toContain("🔥🔥");
    expect(result).toContain("青葉ゼミナール");
  });

  it("uses OpenAI when configured", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text:
          "夏期講習が始まりました。苦手単元の復習を丁寧にサポートします。",
      }),
    );

    const result = await formatInstagramCaptionForGbp(
      {
        schoolName: "青葉ゼミナール",
        caption: "夏期講習スタート！ #塾",
      },
      fetchMock,
    );

    expect(result).toBe(
      "夏期講習が始まりました。苦手単元の復習を丁寧にサポートします。",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openai-key",
        }),
      }),
    );
  });

  it("uses fallback text when OpenAI returns an empty result", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchMock = vi.fn(async () => Response.json({ output_text: "" }));

    const result = await formatInstagramCaptionForGbp(
      {
        schoolName: "青葉ゼミナール",
        caption: "#塾 #個別指導",
      },
      fetchMock,
    );

    expect(result).toBe(
      "青葉ゼミナールよりお知らせです。教室での取り組みをご紹介します。 詳細や体験授業については、お気軽にお問い合わせください。",
    );
  });

  it("throws when OpenAI caption formatting fails", async () => {
    process.env.OPENAI_API_KEY = "openai-key";

    await expect(
      formatInstagramCaptionForGbp(
        {
          schoolName: "青葉ゼミナール",
          caption: "夏期講習",
        },
        vi.fn(async () => new Response("{}", { status: 503 })),
      ),
    ).rejects.toThrow("OpenAI caption formatting failed: 503");
  });
});
