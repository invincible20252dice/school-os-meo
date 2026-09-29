import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildUniversalReview } from "./review-template";
import { normalizeReviewRequest } from "./review-generator";
import { RESPONDENT_QUESTION_ID } from "./survey-respondent";

const input = (school = "全国の任意の高等学校", choice = "オンラインで添削を受けられる", role = "生徒ご本人様") => normalizeReviewRequest({
  schoolName: "実校舎", rating: 5,
  questionAnswers: [
    { questionId: RESPONDENT_QUESTION_ID, value: role },
    { questionId: "arbitrary-school-id", question: "在籍している学校を教えてください", type: "TEXT", value: school },
    { questionId: "new-id", question: "保護者・生徒の皆様へ：感想", type: "MULTI_SELECT", value: [choice] },
  ],
});
const output = (text: string) => ({ status: "completed", output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }] });
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", " test-key "); vi.stubGlobal("fetch", vi.fn<typeof fetch>()); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("universal review generation", () => {
  it("keeps concurrent respondents isolated when the provider finishes in reverse order", async () => {
    let finishStudent!: (response: Response) => void;
    let finishParent!: (response: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise(resolve => { finishStudent = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishParent = resolve; }));
    const student = buildUniversalReview(input("Student School", "早朝相談", "生徒ご本人様"));
    const parent = buildUniversalReview(input("Parent School", "夜間面談", "保護者様"));
    finishParent(Response.json(output('{"review":"子どもの夜間面談を利用しています。"}')));
    expect(await parent).toBe("子どもの夜間面談を利用しています。");
    finishStudent(Response.json(output('{"review":"私は早朝相談を利用しています。"}')));
    expect(await student).toBe("私は早朝相談を利用しています。");
    const sent = vi.mocked(fetch).mock.calls.map(call =>
      JSON.parse(JSON.parse(String(call[1]?.body)).input[1].content.split("\n")[2]));
    expect(sent.map(data => data.respondentType)).toEqual(["STUDENT", "PARENT"]);
    expect(sent.map(data => data.answers.map((answer: { value: unknown }) => answer.value)))
      .toEqual([["Student School", ["早朝相談"]], ["Parent School", ["夜間面談"]]]);
  });
  it.each(["札幌南高等学校", "大阪府立北野高等学校", "九州学院", "International School A", "任意の新設校"])("passes any school name unchanged: %s", async school => {
    const draft = `${school}に通っています。オンラインで添削を受けられるのが便利です。`;
    vi.mocked(fetch).mockResolvedValue(Response.json(output(JSON.stringify({ review: draft }))));
    expect(await buildUniversalReview(input(school))).toBe(draft);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const submitted = JSON.parse(payload.input[1].content.split("\n")[2]);
    expect(submitted.answers[0].value).toBe(school);
    expect(submitted.schoolName).toBe("実校舎");
    expect(submitted.respondentType).toBe("STUDENT");
    expect(payload).toMatchObject({ model: "gpt-4.1-mini", store: false, temperature: 0.88, text: { format: { type: "json_schema", strict: true, schema: { required: ["review"] } } } });
    expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal), headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" } }));
  });
  it.each(["添削を英語で受けられる", "新しい実験設備がある", "相談しても改善しなかった", "保護者様という表現は使わず生徒目線", "記載しない"])("does not validate or rewrite new choice wording: %s", async choice => {
    vi.mocked(fetch).mockResolvedValue(Response.json(output('{"review":"回答に基づく本文。"}')));
    await buildUniversalReview(input("任意の学校", choice));
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const submitted = JSON.parse(payload.input[1].content.split("\n")[2]);
    expect(submitted.answers[1].value).toEqual([choice]);
    expect(submitted.respondentType).toBe("STUDENT");
  });
  it("keeps parent identity explicit despite student words in other answers", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(output('{"review":"子どもが通っています。"}')));
    await buildUniversalReview(input("生徒の通う学校", "STUDENT", "保護者様"));
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).input[1].content).toContain('"respondentType":"PARENT"');
  });
  it("joins provider text parts and normalizes paragraph whitespace without inventing prose", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [
      { type: "output_text", text: '{"review":" 学校に通っています。\\n\\n' },
      { type: "output_text", text: '添削を受けられます。 "}' },
    ] }] }));
    expect(await buildUniversalReview(input())).toBe("学校に通っています。 添削を受けられます。");
  });
  it.each([undefined, "", "   "])("requires a configured provider instead of substituting a template %#", async key => {
    vi.stubEnv("OPENAI_API_KEY", key);
    await expect(buildUniversalReview(input())).rejects.toMatchObject({ code: "NOT_CONFIGURED", status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500])("preserves upstream failure as a failure: %s", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response("private details", { status }));
    await expect(buildUniversalReview(input())).rejects.toMatchObject({ code: "PROVIDER_FAILED", status: status === 429 ? 429 : 502 });
  });
  it.each([null, {}, { status: "incomplete", output: [] }, { status: "completed", output: {} },
    output("{"), output("{}"), output("null"), output('{"review":3}'), output('{"review":" "}'),
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] },
    { status: "completed", output: [] }, { status: "completed", output: [null] },
    { status: "completed", output: [{ type: "message" }] },
  ])("rejects incomplete or malformed output without generating a generic success %#", async payload => {
    vi.mocked(fetch).mockResolvedValue(Response.json(payload));
    await expect(buildUniversalReview(input())).rejects.toMatchObject({ status: 502 });
  });
  it("handles malformed HTTP JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{"));
    await expect(buildUniversalReview(input())).rejects.toMatchObject({ code: "PROVIDER_FAILED", status: 502 });
  });
  it.each([new Error("network private details"), new DOMException("timeout", "TimeoutError")])("does not fabricate a draft on network failure %#", async error => {
    vi.mocked(fetch).mockRejectedValue(error);
    await expect(buildUniversalReview(input())).rejects.toMatchObject({ code: "PROVIDER_FAILED", status: 502 });
  });
});
