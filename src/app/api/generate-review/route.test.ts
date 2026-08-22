import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  vi.unstubAllGlobals();
});

describe("POST /api/generate-review", () => {
  it("returns three fallback reviews when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      new Request("http://localhost/api/generate-review", {
        method: "POST",
        body: JSON.stringify({
          schoolName: "青葉ゼミナール",
          rating: 5,
          selectedReasons: ["質問しやすい雰囲気"],
          freeText: "自分から机に向かう日が増えました。",
        }),
      }),
    );
    const body = (await response.json()) as { reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.reviews).toHaveLength(3);
    expect(body.reviews.join("\n")).toContain("青葉ゼミナール");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns OpenAI generated reviews when the response schema is valid", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            reviews: ["生成口コミ1", "生成口コミ2", "生成口コミ3", "余分な口コミ"],
          }),
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      new Request("http://localhost/api/generate-review", {
        method: "POST",
        body: JSON.stringify({
          schoolName: "青葉ゼミナール",
          rating: 4,
          selectedReasons: ["面倒見がよい"],
          freeText: "定期テスト前の声かけが助かりました。",
        }),
      }),
    );
    const body = (await response.json()) as { reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.reviews).toEqual(["生成口コミ1", "生成口コミ2", "生成口コミ3"]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openai-key",
        }),
      }),
    );
    const [, requestInit] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body)) as {
      input: Array<{ role: string; content: string }>;
    };
    const systemPrompt = payload.input.find((item) => item.role === "system")?.content;
    const userPrompt = payload.input.find((item) => item.role === "user")?.content;

    expect(systemPrompt).toContain("設問文や質問文自体");
    expect(systemPrompt).toContain("キーワード羅列は禁止");
    expect(userPrompt).toContain("selectedKeywords");
    expect(userPrompt).toContain("episode");
  });

  it("falls back when OpenAI returns a response without text", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    const response = await POST(
      new Request("http://localhost/api/generate-review", {
        method: "POST",
        body: JSON.stringify({
          schoolName: "青葉ゼミナール",
          rating: 3,
          selectedReasons: [],
          freeText: "",
        }),
      }),
    );
    const body = (await response.json()) as { reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.reviews).toHaveLength(3);
    expect(body.reviews.join("\n")).toContain("青葉ゼミナール");
  });

  it("falls back when OpenAI JSON does not include reviews", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ output_text: JSON.stringify({}) }), {
            status: 200,
          }),
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/generate-review", {
        method: "POST",
        body: JSON.stringify({
          schoolName: "青葉ゼミナール",
          rating: 4,
          selectedReasons: ["大学受験対策", "価格"],
          freeText: "苦手だった数学に向き合えるようになりました。",
        }),
      }),
    );
    const body = (await response.json()) as { reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.reviews).toHaveLength(3);
    expect(body.reviews.join("\n")).toContain(
      "苦手だった数学に向き合えるようになりました。",
    );
    expect(body.reviews.join("\n")).not.toContain("大学受験対策、価格");
  });

  it("returns a 500 response when OpenAI rejects the request", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429 })),
    );

    const response = await POST(
      new Request("http://localhost/api/generate-review", {
        method: "POST",
        body: JSON.stringify({
          schoolName: "青葉ゼミナール",
          rating: 5,
          selectedReasons: ["質問しやすい雰囲気"],
          freeText: "助かりました。",
        }),
      }),
    );
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(500);
    expect(body.message).toBe("口コミの生成に失敗しました。");
    consoleErrorSpy.mockRestore();
  });

  it("returns a 500 response for invalid JSON", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await POST(
      new Request("http://localhost/api/generate-review", {
        method: "POST",
        body: "{",
      }),
    );
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(500);
    expect(body.message).toBe("口コミの生成に失敗しました。");
    consoleErrorSpy.mockRestore();
  });
});
