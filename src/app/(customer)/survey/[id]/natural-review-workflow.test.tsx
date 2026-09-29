// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyClient from "./survey-client";
import { POST as generate } from "@/app/api/generate-review/route";
import { POST as saveResponse } from "@/app/api/survey-responses/route";
import type { SerializedPublicSurveyResponse } from "@/lib/public-survey-query";
import { RESPONDENT_QUESTION_ID } from "@/lib/survey-respondent";

type StoredAnswer = {
  schoolId: string; source: string; status: string; rating: number; generatedPatterns: string[];
  surveyAnswers: { surveyId: string; schoolName: string; questionAnswers: { questionId: string; value: string | string[] }[] };
};
const boundary = vi.hoisted(() => ({
  school: { findUnique: vi.fn(), upsert: vi.fn() }, user: { upsert: vi.fn() },
  review: { create: vi.fn<(args: { data: StoredAnswer }) => Promise<{ id: string }>>() },
  provider: vi.fn<typeof fetch>(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: boundary }));
function item(id: string, title: string, options: string[], order: number, type = "multiple") {
  return { id, title, question: title, type, internalType: type === "text" ? "TEXT" : "MULTI_SELECT", options, order, maxSelect: null, placeholder: undefined };
}
const questions = [
  item("school", "高校はどこですか？", [], 1, "text"),
  item("grade", "学年を教えてください", ["高校1年生"], 2),
  item("new-choice", "保護者・生徒の皆様へ：最近利用した支援", ["海外大学の出願書類をオンラインで添削してもらえる", "早朝に学習相談ができる"], 3),
];
const initialData: SerializedPublicSurveyResponse = {
  success: true, school: { id: "actual-school", name: "実校舎" }, schoolName: "実校舎",
  googleReviewUrl: "https://g.page/r/actual-school/review", questions,
  survey: { id: "actual-survey", title: "保存済みアンケート", keywords: "", requiredKeywords: "", minChars: 150, maxChars: 280, minCharCount: 150, maxCharCount: 280, reward: "なし", benefitType: "", benefitShowTiming: "", questions, items: questions },
};
const defaultDraft = "任意の学校に通っています。海外大学の出願書類をオンラインで添削してもらえるのが助かります。";
function providerResult(draft: string) {
  return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ review: draft }) }] }] });
}
function fill(role: string, school = "任意の学校") {
  fireEvent.click(screen.getByRole("radio", { name: role }));
  fireEvent.change(screen.getByRole("textbox", { name: "高校はどこですか？" }), { target: { value: school } });
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "回答を送信する" })); }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  boundary.school.findUnique.mockResolvedValue({ id: "actual-school" });
  boundary.review.create.mockResolvedValue({ id: "saved-answer" });
  boundary.provider.mockImplementation(async () => providerResult(defaultDraft));
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (url === "/api/generate-review") return generate(new Request("https://school.test/api/generate-review", init));
    if (url === "/api/survey-responses") return saveResponse(new Request("https://school.test/api/survey-responses", init));
    if (url === "https://api.openai.com/v1/responses") return boundary.provider(url, init);
    throw new Error(`Unexpected URL: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("universal generation and persistence contract", () => {
  it.each([
    ["生徒ご本人様", "札幌南高等学校"], ["保護者様", "九州学院"], ["生徒ご本人様", "International School A"],
  ])("carries new options and %s / %s through real routes, prompt, database and clipboard", async (role, school) => {
    const draft = `${school}に通${role === "生徒ご本人様" ? "っています" : "う子どもの保護者です"}。海外大学の出願書類をオンラインで添削してもらえて助かっています。`;
    boundary.provider.mockImplementation(async () => providerResult(draft));
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill(role, school); submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    const payload = JSON.parse(String(boundary.provider.mock.calls[0][1]?.body));
    const data = JSON.parse(payload.input[1].content.split("\n")[2]);
    expect(data.respondentType).toBe(role === "生徒ご本人様" ? "STUDENT" : "PARENT");
    expect(data.schoolName).toBe("実校舎");
    expect(data.answers.find((a: { questionId: string }) => a.questionId === "school").value).toBe(school);
    expect(data.answers.find((a: { questionId: string }) => a.questionId === "new-choice").value).toEqual(questions[2].options);
    expect(boundary.review.create).toHaveBeenCalledTimes(1);
    const stored = boundary.review.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ schoolId: "actual-school", source: "SURVEY", status: "GENERATED", rating: 5, generatedPatterns: [draft], surveyAnswers: { surveyId: "actual-survey" } });
    expect(stored.surveyAnswers.questionAnswers[0]).toMatchObject({ questionId: RESPONDENT_QUESTION_ID, value: role });
    expect(boundary.school.findUnique).toHaveBeenCalledWith({ where: { id: "actual-school" }, select: { id: true } });
    expect(boundary.school.upsert).not.toHaveBeenCalled();
    expect(boundary.user.upsert).not.toHaveBeenCalled();
    expect(screen.getByText(draft)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "コピーして投稿画面へ" }));
    await screen.findByText("コピー完了");
    expect(copy).toHaveBeenCalledWith(draft);
    expect(open).toHaveBeenCalledWith(initialData.googleReviewUrl, "_blank", "noopener,noreferrer");
  });
  it.each(["school", "write"])("does not offer posting on a %s DB failure and allows retry", async failure => {
    (failure === "school" ? boundary.school.findUnique : boundary.review.create).mockRejectedValueOnce(new Error("database private details"));
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill("生徒ご本人様"); submit();
    await screen.findByText("アンケート回答を保存できませんでした。時間をおいて再度お試しください。");
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
    expect(screen.queryByText(/private details/)).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("任意の学校");
    expect(boundary.review.create).toHaveBeenCalledTimes(failure === "school" ? 0 : 1);
    submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    expect(boundary.review.create).toHaveBeenCalledTimes(failure === "school" ? 1 : 2);
  });
  it.each(["missing-key", "quota", "network"])("retains arbitrary answers on %s without substituting prose", async mode => {
    if (mode === "missing-key") vi.stubEnv("OPENAI_API_KEY", "");
    else if (mode === "quota") boundary.provider.mockResolvedValueOnce(new Response("private", { status: 429 }));
    else boundary.provider.mockRejectedValueOnce(new Error("private"));
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill("生徒ご本人様"); submit();
    await screen.findByText(mode === "missing-key" ? "AI生成の接続設定が未完了です。管理者にお問い合わせください。" : "口コミを生成できませんでした。入力内容は保持されています。時間をおいて再度お試しください。");
    expect(boundary.review.create).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("任意の学校");
    expect(screen.getAllByRole("checkbox").every(node => (node as HTMLInputElement).checked)).toBe(true);
    vi.stubEnv("OPENAI_API_KEY", "test-key"); submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
  });
  it("submits with only respondent and the current rating without a choice-word gate", async () => {
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" })); submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    expect(boundary.provider).toHaveBeenCalledTimes(1);
    expect(boundary.review.create).toHaveBeenCalledTimes(1);
  });
  it("updates the prompt identity after switching roles on the same form", async () => {
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill("保護者様"); submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" })); submit();
    await waitFor(() => expect(boundary.review.create).toHaveBeenCalledTimes(2));
    const prompts = boundary.provider.mock.calls.map(call => JSON.parse(String(call[1]?.body)).input[1].content);
    expect(prompts[0]).toContain('"respondentType":"PARENT"');
    expect(prompts[1]).toContain('"respondentType":"STUDENT"');
  });
});
