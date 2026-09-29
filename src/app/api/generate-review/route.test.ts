import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { RESPONDENT_QUESTION_ID } from "@/lib/survey-respondent";

const request = (body: unknown = { selectedReasons: ["質問しやすい"], questionAnswers: [{ questionId: RESPONDENT_QUESTION_ID, value: "生徒ご本人様" }] }) => new Request("https://school.test/api/generate-review", { method: "POST", body: JSON.stringify(body) });
const output = (text: string) => ({ status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] });
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn<typeof fetch>());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("POST /api/generate-review", () => {
  it.each(["生徒ご本人様", "保護者様"])("sends %s and the school answer to the real prompt builder and parses HTTP Responses output", async value => {
    const draft = value === "生徒ご本人様" ? "九州学院に通っています。質問がしやすいです。" : "九州学院に通う子どもが質問しやすいと話しています。";
    vi.mocked(fetch).mockResolvedValue(Response.json(output(JSON.stringify({ review: ` ${draft} ` }))));
    const response = await POST(request({ schoolName: "iスクール予備校", questionAnswers: [
      { questionId: RESPONDENT_QUESTION_ID, value },
      { questionId: "school", question: "高校はどこですか？", type: "TEXT", value: "九州学院" },
    ] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, generationSource: "ai", review: draft, reviews: [draft] });
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal), headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" } }));
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload.store).toBe(false);
    expect(payload.temperature).toBe(0.88);
    expect(payload).not.toHaveProperty("presence_penalty");
    expect(payload.text.format).toMatchObject({ type: "json_schema", strict: true, schema: { required: ["review"] } });
    expect(payload.input[1].content).toContain(`【属性】: ${value === "生徒ご本人様" ? "生徒本人" : "保護者"}`);
    expect(payload.input[1].content).toContain('"question":"高校はどこですか？","type":"TEXT","value":"九州学院"');
  });
  it.each([{}, null, { questionAnswers: [] }, { questionAnswers: [{ questionId: RESPONDENT_QUESTION_ID, value: ["保護者様", "生徒ご本人様"] }] }])("rejects missing/invalid identity before the provider call %#", async body => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed request JSON", async () => {
    expect((await POST(new Request("https://school.test", { method: "POST", body: "{" }))).status).toBe(400);
  });
  it("returns an answer-based draft without a provider key and without making an external call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, generationSource: "answers", review: "質問しやすいと感じています。", reviews: ["質問しやすいと感じています。"] });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])("returns a labelled answer-based draft for provider HTTP %s", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response("private provider details", { status }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, generationSource: "answers", review: "質問しやすいと感じています。" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private provider");
  });
  it.each([{}, { status: "incomplete", output: [] }, { status: "completed", output: {} }, output("{"), output("{}"), output('{"review":3}'), output('{"review":" "}'),
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] },
    { status: "completed", output: [] },
  ])("replaces incomplete or malformed generation with grounded answer text %#", async payload => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ generationSource: "answers", review: "質問しやすいと感じています。" });
  });
  it("returns the answer-based draft when the provider times out", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ generationSource: "answers" });
  });
  it("rejects identity-only input instead of inventing a generic positive experience", async () => {
    const response = await POST(request({ questionAnswers: [{ questionId: RESPONDENT_QUESTION_ID, value: "保護者様" }] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "通塾についての選択肢または自由記述を入力してください。" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
