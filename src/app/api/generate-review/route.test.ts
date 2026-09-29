import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { RESPONDENT_QUESTION_ID } from "@/lib/survey-respondent";
import * as engine from "@/lib/review-template";

const request = (body: unknown = { rating: 5, questionAnswers: [{ questionId: RESPONDENT_QUESTION_ID, value: "生徒ご本人様" }] }) => new Request("https://school.test/api/generate-review", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"review":"自由な回答に基づく文章。"}' }] }] })));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("POST /api/generate-review", () => {
  it.each(["生徒ご本人様", "保護者様"])("sends arbitrary new options and a school name for %s without a dictionary gate", async role => {
    const questionAnswers = [{ questionId: RESPONDENT_QUESTION_ID, value: role },
      { questionId: "new-school-id", question: "高校はどこですか？", type: "TEXT", value: "国際未来高等学校" },
      { questionId: "new-choice", question: "新しく編集した設問", type: "MULTI_SELECT", value: ["宇宙工学の課題に取り組める", "オンラインで夜間相談ができる"] },
    ];
    const response = await POST(request({ rating: 5, questionAnswers }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, generationSource: "ai", review: "自由な回答に基づく文章。", reviews: ["自由な回答に基づく文章。"] });
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(JSON.parse(payload.input[1].content.split("\n")[2]).answers).toEqual(questionAnswers.slice(1));
  });
  it("submits when only required identity and rating are provided", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([{}, null, { questionAnswers: [] }, { questionAnswers: [{ questionId: RESPONDENT_QUESTION_ID, value: ["保護者様", "生徒ご本人様"] }] }])("rejects invalid identity before calling the provider %#", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed request JSON", async () => {
    expect((await POST(new Request("https://school.test", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("reports configuration failure without a fake review", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, message: "AI生成の接続設定が未完了です。管理者にお問い合わせください。" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])("returns a sanitized upstream failure for %s", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response("private details", { status }));
    const response = await POST(request());
    expect(response.status).toBe(status === 429 ? 429 : 502);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body).not.toHaveProperty("review");
    expect(JSON.stringify(body)).not.toContain("private details");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private details");
  });
  it("sanitizes unexpected failures", async () => {
    vi.spyOn(engine, "buildUniversalReview").mockRejectedValueOnce(new Error("private exception"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ success: false });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private exception");
  });
});
