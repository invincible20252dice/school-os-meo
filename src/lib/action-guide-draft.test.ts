import { afterEach, describe, expect, it, vi } from "vitest";
import { generateGuideDraft, guideDraftInput } from "./action-guide-draft";
const input = { purpose: "description" as const, theme: "教室紹介", facts: "高校生対象。予約制の学習相談。", school: { name: "校舎A", addressLine: null, phoneNumber: null, websiteUrl: null } };
afterEach(() => vi.unstubAllEnvs());
describe("fact-bound guide drafts", () => {
  it.each(["description", "post", "improvement"])("validates %s", purpose => expect(guideDraftInput({ purpose, theme: " テーマ ", facts: " 事実 " })).toEqual({ purpose, theme: "テーマ", facts: "事実" }));
  it.each([null, {}, { ...input, purpose: "reply" }, { ...input, facts: " " }, { ...input, theme: " " }, { ...input, facts: "x".repeat(2001) }])("rejects invalid/missing facts %j", body => expect(() => guideDraftInput(body)).toThrow());
  it("requires a key and never substitutes a template", async () => {
    vi.stubEnv("OPENAI_API_KEY", " "); const fetcher = vi.fn();
    await expect(generateGuideDraft(input, fetcher)).rejects.toThrow("接続設定"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses server school facts and explicit facts, with no persistence/publication", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [null, { type: "reasoning" }, { type: "message" }, { type: "message", content: [{ type: "output_text", text: " 下書き " }, { type: "other" }, { type: "output_text", text: 3 }] }] }));
    expect(await generateGuideDraft(input, fetcher)).toBe("下書き");
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(JSON.parse(body.input[1].content)).toEqual(input);
    expect(body.store).toBe(false); expect(body.input[0].content).toContain("themeは題材であり事実の証拠ではない");
    expect(body.input[0].content).toContain("推測しない");
  });
  it.each([
    { status: "incomplete", output: [] }, { status: "completed" },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
    { status: "completed", output: [] },
    { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "x".repeat(4001) }] }] },
  ])("rejects unusable provider output", async body => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    await expect(generateGuideDraft(input, vi.fn().mockResolvedValue(Response.json(body)))).rejects.toThrow();
  });
  it("propagates connection, parse and provider errors without success text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "key");
    for (const response of [new Response("", { status: 429 }), new Response("not-json")]) await expect(generateGuideDraft(input, vi.fn().mockResolvedValue(response))).rejects.toThrow();
    await expect(generateGuideDraft(input, vi.fn().mockRejectedValue(new Error("timeout")))).rejects.toThrow("timeout");
  });
});
