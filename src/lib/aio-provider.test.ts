import { afterEach, describe, expect, it, vi } from "vitest";
import { measureOpenAi, AioProviderError, AIO_MODEL } from "./aio-provider";

const citation = { type: "url_citation", url: "https://example.org/school", title: "School", start_index: 0, end_index: 3 };
const answer = (text: string, extra = {}) => ({ status: "completed", model: AIO_MODEL, output: [
  { type: "web_search_call", status: "completed" },
  { type: "message", content: [{ type: "output_text", text, annotations: [citation] }] },
], ...extra });
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const input = { query: "検証駅周辺のおすすめの塾", schoolName: "検証塾" };
afterEach(() => vi.unstubAllEnvs());

describe("OpenAI live measurement adapter (mock HTTP only)", () => {
  it("requires a real configured credential before any network access", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetcher = vi.fn();
    await expect(measureOpenAi(input, fetcher)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("forces search without revealing the target school and validates recommendation evidence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn().mockResolvedValueOnce(reply(answer("検証塾がおすすめです。")))
      .mockResolvedValueOnce(reply(answer(JSON.stringify({ recommended: true, evidence: "検証塾がおすすめです。" }))));
    const result = await measureOpenAi(input, fetcher);
    expect(result).toMatchObject({ brandDetected: true, recommended: true, score: 100, evidence: "検証塾がおすすめです。" });
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request).toMatchObject({ model: AIO_MODEL, tool_choice: "required", store: false, max_tool_calls: 1 });
    expect(JSON.stringify(request)).not.toContain(input.schoolName);
    expect(result.citations).toEqual([{ url: citation.url, title: citation.title }]);
  });
  it("returns a genuine zero for a completed searched answer without the school, without a classifier call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn().mockResolvedValue(reply(answer("別の塾が候補です。")));
    expect(await measureOpenAi(input, fetcher)).toMatchObject({ brandDetected: false, recommended: false, score: 0 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("separates mentioned from recommended", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn().mockResolvedValueOnce(reply(answer("検証塾は推奨しません。")))
      .mockResolvedValueOnce(reply(answer(JSON.stringify({ recommended: false, evidence: "" }))));
    expect(await measureOpenAi(input, fetcher)).toMatchObject({ brandDetected: true, recommended: false, score: 0 });
  });
  it.each([[429, "RATE_LIMIT"], [401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [500, "PROVIDER_FAILED"]])("redacts HTTP %s instead of returning zero", async (status, code) => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn().mockResolvedValue(reply({ error: { message: "secret", code: "unknown" } }, status as number));
    await expect(measureOpenAi(input, fetcher)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: "incomplete" }, { output: [] },
    { output: [{ type: "message", content: [{ type: "refusal" }] }] },
    { output: [{ type: "web_search_call", status: "completed" }, { type: "message", content: [{ type: "output_text", text: "answer", annotations: [] }] }] },
  ])("rejects incomplete, unsearched or uncited answers", async extra => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    await expect(measureOpenAi(input, vi.fn().mockResolvedValue(reply(answer("検証塾", extra))))).rejects.toBeInstanceOf(AioProviderError);
  });
  it("rejects fabricated recommendation evidence", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn().mockResolvedValueOnce(reply(answer("検証塾の情報はありません。")))
      .mockResolvedValueOnce(reply(answer(JSON.stringify({ recommended: true, evidence: "検証塾がおすすめ" }))));
    await expect(measureOpenAi(input, fetcher)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it.each(["TimeoutError", "TypeError"])("safely handles %s", async name => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    await expect(measureOpenAi(input, vi.fn().mockRejectedValue(Object.assign(new Error("secret"), { name })))).rejects.toMatchObject({ code: name === "TimeoutError" ? "TIMEOUT" : "PROVIDER_FAILED" });
  });
  it.each([{ query: "", schoolName: "塾" }, { query: "q".repeat(1501), schoolName: "塾" }, { query: "q", schoolName: " " }])("rejects invalid input before spending", async invalid => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn();
    await expect(measureOpenAi(invalid, fetcher)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [{ type: "message" }],
    [{ type: "message", content: [{ type: "output_text" }] }],
    [{ type: "message", content: [{ type: "output_text", text: "answer" }] }],
    [{ type: "web_search_call", status: "failed" }, { type: "message", content: [{ type: "output_text", text: "answer" }] }],
  ].map(output => ({ output })))("rejects malformed or unsearched output", async ({ output }) => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    await expect(measureOpenAi(input, vi.fn().mockResolvedValue(reply(answer("", { output }))))).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("filters unsafe, invalid and duplicate citations while retaining verified HTTP citations", async () => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const annotations = [
      { type: "file_citation" }, { type: "url_citation" },
      { type: "url_citation", url: "not-a-url" }, { type: "url_citation", url: "javascript:alert(1)" },
      { type: "url_citation", url: "https://user:password@example.org" },
      { type: "url_citation", url: "https://example.org" }, { type: "url_citation", url: "https://example.org" },
    ];
    const payload = answer("", { output: [{ type: "web_search_call", status: "completed" }, { type: "message", content: [
      { type: "output_text", text: "別の塾", annotations }, { type: "output_text", text: "です。" },
    ] }] });
    expect((await measureOpenAi(input, vi.fn().mockResolvedValue(reply(payload)))).citations).toEqual([{ url: "https://example.org/", title: "example.org" }]);
  });
  it.each([{ recommended: "yes", evidence: "" }, { recommended: true, evidence: 1 }, { recommended: false, evidence: "wrong" }])("rejects malformed classifier decisions", async decision => {
    vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
    const fetcher = vi.fn().mockResolvedValueOnce(reply(answer("検証塾です。"))).mockResolvedValueOnce(reply(answer(JSON.stringify(decision))));
    await expect(measureOpenAi(input, fetcher)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
