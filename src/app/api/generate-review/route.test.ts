import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  vi.unstubAllGlobals();
});

describe("POST /api/generate-review", () => {
  it("returns one fallback review when OpenAI is not configured", async () => {
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
    const body = (await response.json()) as { review: string; reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.review).toContain("青葉ゼミナール");
    expect(body.reviews).toEqual([body.review]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns one OpenAI generated review when the response schema is valid", async () => {
    process.env.OPENAI_API_KEY = "openai-key";
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            review: "生成口コミ1",
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
          keywords: "個別指導, 大学受験",
          questionAnswers: [
            { question: "学年", value: "高校生" },
            { question: "通塾のきっかけ", value: "大学受験対策" },
            { question: "良かった点", value: ["面倒見がよい"] },
          ],
        }),
      }),
    );
    const body = (await response.json()) as { review: string; reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.review).toBe("生成口コミ1");
    expect(body.reviews).toEqual(["生成口コミ1"]);
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
      temperature: number;
      presence_penalty: number;
      input: Array<{ role: string; content: string }>;
    };
    const systemPrompt = payload.input.find((item) => item.role === "system")?.content;
    const userPrompt = payload.input.find((item) => item.role === "user")?.content;

    expect(payload.temperature).toBeGreaterThanOrEqual(0.85);
    expect(payload.temperature).toBeLessThanOrEqual(0.9);
    expect(payload.presence_penalty).toBe(0.6);
    expect(systemPrompt).toContain("1つの口コミ文");
    expect(systemPrompt).toContain("複数案は不要");
    expect(systemPrompt).toContain("固定テンプレート構文");
    expect(systemPrompt).toContain("そのままコピペ結合しない");
    expect(userPrompt).toContain("【学年】: 高校生");
    expect(userPrompt).toContain("【通塾のきっかけ】: 大学受験対策");
    expect(userPrompt).toContain("【含めたいキーワード】: 個別指導, 大学受験");
    expect(userPrompt).toContain("【今回の語り口】:");
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
    const body = (await response.json()) as { review: string; reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.review).toContain("青葉ゼミナール");
    expect(body.reviews).toEqual([body.review]);
  });

  it("falls back when OpenAI JSON does not include a review", async () => {
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
    const body = (await response.json()) as { review: string; reviews: string[] };

    expect(response.status).toBe(200);
    expect(body.reviews).toEqual([body.review]);
    expect(body.review).toContain("苦手だった数学に向き合えるようになりました。");
    expect(body.review).not.toContain("自由記述");
    expect(body.review).not.toContain("大学受験対策、価格");
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
