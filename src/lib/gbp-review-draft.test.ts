import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReviewReplyDraft } from "./gbp-review-draft";

const input = { schoolName: "対象校舎", rating: 4, reviewText: "質問に丁寧に答えてもらえました。" };
describe("generateReviewReplyDraft", () => {
  beforeEach(() => vi.stubEnv("OPENAI_API_KEY", " test-key "));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("reads actual HTTP output and sends the school's configured instructions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "completed", output: [
      null, { type: "reasoning" }, { type: "message" },
      { type: "message", content: [{ type: "output_text", text: " ご投稿ありがとうございます。" }, { type: "output_text", text: "今後も丁寧に対応いたします。 " }] },
    ] }));
    vi.stubGlobal("fetch", fetcher);
    const setting = { promptSystemRole: "教室長として返信", googleRefreshToken: "must-not-leak", schoolId: "private-school-id" };
    expect(await generateReviewReplyDraft({ ...input, promptSetting: setting })).toBe("ご投稿ありがとうございます。今後も丁寧に対応いたします。");
    const request = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(request.store).toBe(false);
    expect(request.input[0].content).toContain("教室長として返信");
    expect(request.input[0].content).toContain("推測しない");
    expect(JSON.parse(request.input[1].content)).toMatchObject(input);
    expect(JSON.stringify(request)).not.toContain("must-not-leak");
    expect(JSON.stringify(request)).not.toContain("private-school-id");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer test-key" });
  });

  it.each([undefined, "", "  "])("rejects an absent key without a template (%s)", async key => {
    vi.stubEnv("OPENAI_API_KEY", key);
    const fetcher = vi.fn();
    await expect(generateReviewReplyDraft(input, fetcher)).rejects.toThrow("接続設定");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 429, 503])("rejects HTTP %s without exposing provider payload", async status => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: "private-provider-detail" }, { status }));
    await expect(generateReviewReplyDraft(input, fetcher)).rejects.toThrow(`status=${status}`);
  });

  it.each([
    null, {}, { status: "incomplete", output: [] }, { status: "completed", output: {} },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
    { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: 4 }, { type: "other" }, { type: "output_text", text: " " }] }] },
  ])("rejects unusable output (%j)", async data => {
    await expect(generateReviewReplyDraft(input, vi.fn().mockResolvedValue(Response.json(data)))).rejects.toThrow();
  });

  it("propagates timeout and malformed JSON without producing a draft", async () => {
    await expect(generateReviewReplyDraft(input, vi.fn().mockRejectedValue(new Error("timeout")))).rejects.toThrow("timeout");
    await expect(generateReviewReplyDraft(input, vi.fn().mockResolvedValue(new Response("not-json")))).rejects.toThrow();
  });
});
