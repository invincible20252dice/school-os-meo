// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyClient from "./survey-client";
import { POST as generate } from "@/app/api/generate-review/route";
import { POST as saveResponse } from "@/app/api/survey-responses/route";
import type { SerializedPublicSurveyResponse } from "@/lib/public-survey-query";
import { RESPONDENT_QUESTION_ID } from "@/lib/survey-respondent";

type StoredAnswer = {
  schoolId: string;
  source: string;
  status: string;
  rating: number;
  generatedPatterns: string[];
  surveyAnswers: {
    surveyId: string;
    schoolName: string;
    questionAnswers: { questionId: string; value: string | string[] }[];
  };
};
const boundary = vi.hoisted(() => ({
  school: { findUnique: vi.fn(), upsert: vi.fn() },
  user: { upsert: vi.fn() },
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
  item("reason", "通塾のきっかけ", ["大学受験対策", "大学受験の専門対策をしたかった", "何から勉強していいかわからない"], 3),
  item("support", "良かった点", ["わかりやすい個別指導", "質問しやすい", "質問しやすさ"], 4),
  item("change", "通塾後の変化", ["勉強時間が増えた"], 5),
  item("environment", "教室環境", ["自習室が静かで集中できる"], 6),
  item("closing", "今後について", ["受験本番まで引き続きお願いしたいです"], 7),
];
const initialData: SerializedPublicSurveyResponse = {
  success: true, school: { id: "actual-school", name: "実校舎" }, schoolName: "実校舎",
  googleReviewUrl: "https://g.page/r/actual-school/review", questions,
  survey: { id: "actual-survey", title: "保存済みアンケート", keywords: "逆転合格", requiredKeywords: "逆転合格", minChars: 150, maxChars: 280, minCharCount: 150, maxCharCount: 280, reward: "なし", benefitType: "", benefitShowTiming: "", questions, items: questions },
};
const paragraphs = [
  "入塾前は、何から勉強を始めればよいかわからないことが悩みでした。大学受験の対策を目的に、通塾を決めました。",
  "わかりやすい個別指導と先生への質問のしやすさが、通う中で良いと感じる点です。通塾後は、勉強時間の増加という変化もありました。",
  "静かで集中しやすい自習室も魅力です。受験本番まで引き続きお世話になりたいです。",
];
function fill(role: string) {
  fireEvent.click(screen.getByRole("radio", { name: role }));
  fireEvent.change(screen.getByRole("textbox", { name: "高校はどこですか？" }), { target: { value: "済々黌高校" } });
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "回答を送信する" })); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  boundary.school.findUnique.mockResolvedValue({ id: "actual-school" });
  boundary.review.create.mockResolvedValue({ id: "saved-answer" });
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    if (url === "/api/generate-review") return generate(new Request("https://school.test/api/generate-review", init));
    if (url === "/api/survey-responses") return saveResponse(new Request("https://school.test/api/survey-responses", init));
    if (url === "https://api.openai.com/v1/responses") return boundary.provider(url, init);
    throw new Error(`Unexpected URL: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("actual composition and persistence contract", () => {
  it.each(["生徒ご本人様", "保護者様"])("carries the four-paragraph %s draft through actual routes, normalization, Prisma arguments and clipboard", async role => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill(role);
    submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    const intro = role === "生徒ご本人様"
      ? "済々黌高校に通う高校1年生で、実校舎で学んでいます。"
      : "済々黌高校に通う高校1年生の子どもが実校舎に通っています。";
    const draft = [intro, ...paragraphs].join("\n\n");
    expect(boundary.review.create).toHaveBeenCalledTimes(1);
    const stored = boundary.review.create.mock.calls[0][0].data;
    expect(stored).toMatchObject({ schoolId: "actual-school", source: "SURVEY", status: "GENERATED", rating: 5, generatedPatterns: [draft], surveyAnswers: { surveyId: "actual-survey", schoolName: "実校舎" } });
    expect(stored.surveyAnswers.questionAnswers[0]).toMatchObject({ questionId: RESPONDENT_QUESTION_ID, value: role });
    expect(stored.surveyAnswers.questionAnswers).toHaveLength(8);
    expect(boundary.school.findUnique).toHaveBeenCalledWith({ where: { id: "actual-school" }, select: { id: true } });
    expect(boundary.school.upsert).not.toHaveBeenCalled();
    expect(boundary.user.upsert).not.toHaveBeenCalled();
    expect(boundary.provider).not.toHaveBeenCalled();
    expect(screen.getByText(draft.replace(/\s+/g, " "))).toBeTruthy();
    expect(draft).not.toContain("高校高校");
    expect(draft).not.toContain("逆転合格");
    expect(draft.match(/質問のしやすさ/g)).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "コピーして投稿画面へ" }));
    await screen.findByText("コピー完了");
    expect(copy).toHaveBeenCalledWith(draft);
    expect(open).toHaveBeenCalledWith(initialData.googleReviewUrl, "_blank", "noopener,noreferrer");
  });

  it.each(["school", "write"])("never replaces a %s DB error with success and retries the actual operation", async failure => {
    const failing = failure === "school" ? boundary.school.findUnique : boundary.review.create;
    failing.mockRejectedValueOnce(new Error("database unavailable: internal details"));
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill("生徒ご本人様");
    submit();
    await screen.findByText("アンケート回答を保存できませんでした。時間をおいて再度お試しください。");
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
    expect(screen.queryByText(/アンケート回答を保存しました/)).toBeNull();
    expect(screen.queryByText(/internal details/)).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("済々黌高校");
    expect(boundary.review.create).toHaveBeenCalledTimes(failure === "school" ? 0 : 1);
    expect(boundary.school.upsert).not.toHaveBeenCalled();
    submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    expect(boundary.review.create).toHaveBeenCalledTimes(failure === "school" ? 1 : 2);
  });

  it("keeps API validation failures out of the database", async () => {
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" }));
    submit();
    await screen.findByText("通塾についての選択肢または自由記述を入力してください。");
    expect(boundary.school.findUnique).not.toHaveBeenCalled();
    expect(boundary.review.create).not.toHaveBeenCalled();
    expect(boundary.provider).not.toHaveBeenCalled();
  });

  it("persists the real provider response without replacing it with deterministic prose", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const draft = "済々黌高校に通っています。\n\n質問しやすいと感じています。";
    boundary.provider.mockResolvedValue(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ review: draft }) }] }] }));
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill("生徒ご本人様");
    submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    expect(boundary.review.create.mock.calls[0][0].data.generatedPatterns).toEqual([draft]);
    expect(screen.queryByText("回答内容から作成した下書き")).toBeNull();
    expect(boundary.provider).toHaveBeenCalledTimes(1);
  });

  it("recomposes after switching roles without retaining the previous perspective", async () => {
    render(<SurveyClient schoolId="actual-school" surveyId="actual-survey" initialData={initialData} />);
    fill("保護者様");
    submit();
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    expect(boundary.review.create.mock.calls[0][0].data.generatedPatterns[0]).toContain("子ども");
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" }));
    submit();
    await waitFor(() => expect(boundary.review.create).toHaveBeenCalledTimes(2));
    expect(boundary.review.create.mock.calls[1][0].data.generatedPatterns[0]).not.toContain("子ども");
    await screen.findByRole("button", { name: "コピーして投稿画面へ" });
    expect(screen.queryByText(/高校1年生の子ども/)).toBeNull();
  });
});
