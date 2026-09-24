import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeReviews } from "./review-analytics-ai";
const inputs = [{ id: "r1", text: "先生の説明が丁寧です。" }];
const rows = [{ reviewId: "r1", language: "ja", opinions: [{ category: "指導品質・講師対応", sentiment: "positive", quote: "説明が丁寧" }] }];
const payload = () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reviews: rows }) }] }] });
beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());
describe("review analysis provider", () => {
  it("uses structured Responses output, bounded timeout and minimal source data", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(payload()));
    expect(await analyzeReviews(inputs, fetcher)).toEqual(rows);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.openai.com/v1/responses");
    const init = fetcher.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({ model: "gpt-4o", store: false, input: JSON.stringify(inputs), text: { format: { type: "json_schema", strict: true } } });
  });
  it("does not call a provider for empty datasets", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetcher = vi.fn();
    expect(await analyzeReviews([], fetcher)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails explicitly when unconfigured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(analyzeReviews(inputs, vi.fn())).rejects.toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
  });
  it.each([403, 429, 500])("does not synthesize analysis on HTTP %s", async status => {
    await expect(analyzeReviews(inputs, vi.fn().mockResolvedValue(new Response("secret", { status })))).rejects.toMatchObject({ code: "PROVIDER_FAILED", status: 502 });
  });
  it("handles timeout and invalid HTTP JSON", async () => {
    for (const fetcher of [vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")), vi.fn().mockResolvedValue(new Response("not json"))]) {
      await expect(analyzeReviews(inputs, fetcher)).rejects.toMatchObject({ code: "PROVIDER_FAILED" });
    }
  });
  it.each([null, { status: "incomplete", output: [] }, { status: "completed", output: null }, { status: "completed", output: [] }, { status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "refusal" }] }] }, { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "invalid" }] }] }, { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"reviews":[]}' }] }] }])("rejects incomplete, refused, or malformed responses %#", async value => {
    await expect(analyzeReviews(inputs, vi.fn().mockResolvedValue(Response.json(value)))).rejects.toMatchObject({ code: "INVALID_ANALYSIS", status: 502 });
  });
});
