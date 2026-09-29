// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyClient from "./survey-client";
import { POST as generate } from "@/app/api/generate-review/route";
import { POST as saveResponse } from "@/app/api/survey-responses/route";
import type { SerializedPublicSurveyResponse } from "@/lib/public-survey-query";
import { RESPONDENT_QUESTION_ID } from "@/lib/survey-respondent";
const boundary = vi.hoisted(() => ({ persist: vi.fn(), provider: vi.fn<typeof fetch>() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/survey-persistence", async () => ({ ...await vi.importActual<typeof import("@/lib/survey-persistence")>("@/lib/survey-persistence"), persistSurveyResponse: boundary.persist }));

const questions = [
  { id: "school", title: "高校はどこですか？", question: "高校はどこですか？", type: "text", internalType: "TEXT", options: [], order: 1, maxSelect: null, placeholder: undefined },
  { id: "good", title: "良かった点", question: "良かった点", type: "single", internalType: "SINGLE_SELECT", options: ["質問しやすい"], order: 2, maxSelect: null, placeholder: undefined },
];
const initialData: SerializedPublicSurveyResponse = {
  success: true, school: { id: "s1", name: "実校舎" }, schoolName: "実校舎", googleReviewUrl: "https://g.page/r/example/review",
  survey: { id: "v1", title: "実アンケート", keywords: "", requiredKeywords: "", minChars: 150, maxChars: 280, minCharCount: 150, maxCharCount: 280, reward: "なし", benefitType: "", benefitShowTiming: "", items: questions, questions }, questions,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  boundary.persist.mockResolvedValue({ id: "response1" });
  boundary.provider.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ review: "九州学院に通っています。質問しやすいと感じます。" }) }] }] }));
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (url === "https://api.openai.com/v1/responses") return boundary.provider(url, init);
    if (url === "/api/generate-review") return generate(new Request("https://school.test/api/generate-review", init));
    if (url === "/api/survey-responses") return saveResponse(new Request("https://school.test/api/survey-responses", init));
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("public respondent workflow", () => {
  it("displays unselected fixed Q1 before legacy questions and rejects missing identity without any HTTP request", async () => {
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={initialData} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map(node => node.textContent);
    expect(headings.slice(0, 3)).toEqual(["ご回答者様を選択してください（必須）", "高校はどこですか？", "良かった点"]);
    expect((screen.getByRole("radio", { name: "保護者様" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("radio", { name: "生徒ご本人様" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText("ご回答者様（保護者様 / 生徒ご本人様）を選択してください。");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["生徒ご本人様", "保護者様"])("carries %s and school context from radios/text to the prompt and saved answer", async value => {
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={initialData} />);
    fireEvent.click(screen.getByRole("radio", { name: value }));
    fireEvent.change(screen.getByRole("textbox", { name: "高校はどこですか？" }), { target: { value: "九州学院" } });
    fireEvent.click(screen.getByRole("radio", { name: "質問しやすい" }));
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    const payload = JSON.parse(String(boundary.provider.mock.calls[0][1]?.body));
    expect(payload.input[1].content).toContain(`【属性】: ${value === "生徒ご本人様" ? "生徒本人" : "保護者"}`);
    expect(payload.input[1].content).toContain('"question":"高校はどこですか？","type":"TEXT","value":"九州学院"');
    expect(boundary.persist).toHaveBeenCalledWith({}, expect.objectContaining({
      schoolId: "s1", surveyId: "v1", selectedReasons: ["質問しやすい"],
      questionAnswers: expect.arrayContaining([{ questionId: RESPONDENT_QUESTION_ID, question: "ご回答者様を選択してください", type: "SINGLE_SELECT", value }]),
    }));
    expect(boundary.provider).toHaveBeenCalledTimes(1);
  });
  it("saves respondent identity even in the low-rating flow without generation", async () => {
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={initialData} />);
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" }));
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText("アンケート回答を保存しました。ご意見は教室改善のために確認します。");
    expect(boundary.provider).not.toHaveBeenCalled();
    expect(boundary.persist.mock.calls[0][1].questionAnswers[0].value).toBe("生徒ご本人様");
  });
  it("keeps answers without fabricating a draft when the provider fails", async () => {
    boundary.provider.mockResolvedValue(new Response("rejected", { status: 429 }));
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={initialData} />);
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" }));
    fireEvent.change(screen.getByRole("textbox", { name: "高校はどこですか？" }), { target: { value: "済々黌" } });
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText("口コミを生成できませんでした。入力内容は保持されています。時間をおいて再度お試しください。");
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
    expect((screen.getByRole("textbox", { name: "高校はどこですか？" }) as HTMLTextAreaElement).value).toBe("済々黌");
    expect((screen.getByRole("radio", { name: "生徒ご本人様" }) as HTMLInputElement).checked).toBe(true);
    await waitFor(() => expect((screen.getByRole("button", { name: "回答を送信する" }) as HTMLButtonElement).disabled).toBe(false));
  });
  it.each(["生徒ご本人様", "保護者様"])("does not claim successful generation for %s without a provider key", async value => {
    vi.stubEnv("OPENAI_API_KEY", "");
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={initialData} />);
    fireEvent.click(screen.getByRole("radio", { name: value }));
    fireEvent.change(screen.getByRole("textbox", { name: "高校はどこですか？" }), { target: { value: "九州学院" } });
    fireEvent.click(screen.getByRole("radio", { name: "質問しやすい" }));
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText("AI生成の接続設定が未完了です。管理者にお問い合わせください。");
    expect(boundary.provider).not.toHaveBeenCalled();
    expect(boundary.persist).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
  });
  it("rejects direct answer-save requests without identity before persistence", async () => {
    const response = await saveResponse(new Request("https://school.test/api/survey-responses", { method: "POST", body: JSON.stringify({ schoolId: "s1", questionAnswers: [] }) }));
    expect(response.status).toBe(400);
    expect(boundary.persist).not.toHaveBeenCalled();
  });
});
