// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyClient from "./survey-client";
import type { SerializedPublicSurveyResponse } from "@/lib/public-survey-query";
import { RESPONDENT_QUESTION_ID } from "@/lib/survey-respondent";

const questions = [
  { id: "text", title: "高校はどこですか？", question: "高校はどこですか？", type: "text", internalType: "TEXT", options: [], order: 1, maxSelect: null, placeholder: "学校名" },
  { id: "multi", title: "良かった点", question: "良かった点", type: "multiple", internalType: "MULTI_SELECT", options: ["質問", "環境", "指導"], order: 2, maxSelect: 2, placeholder: undefined },
];
const data: SerializedPublicSurveyResponse = {
  success: true, school: { id: "s1", name: "保存済み校舎" }, schoolName: "保存済み校舎", googleReviewUrl: "https://g.page/r/saved/review",
  survey: { id: "v1", title: "保存済みアンケート", keywords: "個別指導", requiredKeywords: "個別指導", minChars: 150, maxChars: 280, minCharCount: 150, maxCharCount: 280, reward: "なし", benefitType: "", benefitShowTiming: "", questions, items: questions }, questions,
};
const fetchMock = vi.fn<typeof fetch>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function chooseAndSubmit() {
  fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" }));
  fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("public survey loading and input", () => {
  it.each([2, 3, null, 0])("uses configured maxSelect=%s for both guidance and actual selection", async maxSelect => {
    const updatedQuestions = [questions[0], { ...questions[1], maxSelect, options: ["A", "B", "C", "D"] }];
    const updated = { ...data, questions: updatedQuestions, survey: { ...data.survey!, questions: updatedQuestions, items: updatedQuestions } };
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={updated} />);
    expect(screen.getByText("1つ選択してください")).toBeTruthy();
    const multi = screen.getByRole("heading", { name: "良かった点" }).closest("section")!;
    expect(within(multi).getByText(maxSelect ? `${maxSelect}つまで選択できます` : "複数選択できます")).toBeTruthy();
    const text = screen.getByRole("textbox").closest("section")!;
    expect(within(text).queryByText(/選択/)).toBeNull();
    const count = maxSelect || 4;
    for (let i = 0; i < count; i++) {
      fireEvent.click(screen.getByRole("checkbox", { name: updatedQuestions[1].options[i] }));
      expect(screen.getAllByRole("checkbox").filter(input => (input as HTMLInputElement).checked)).toHaveLength(i + 1);
    }
    if (maxSelect) {
      const excess = screen.getByRole("checkbox", { name: updatedQuestions[1].options[count] });
      fireEvent.click(excess);
      expect((excess as HTMLInputElement).checked).toBe(false);
      expect(within(multi).getByRole("status").textContent).toBe(`${maxSelect}つまで選択できます`);
      fireEvent.click(screen.getByRole("checkbox", { name: "A" }));
      expect(within(multi).queryByRole("status")).toBeNull();
      fireEvent.click(excess);
      expect((excess as HTMLInputElement).checked).toBe(true);
    } else expect(within(multi).queryByRole("status")).toBeNull();
  });

  it("reflects a changed stored maximum on reload without modifying the questions or answers in storage", async () => {
    const original = structuredClone(data);
    const view = render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    expect(screen.getByText("2つまで選択できます")).toBeTruthy();
    const updatedQuestions = [questions[0], { ...questions[1], maxSelect: 3 }];
    view.rerender(<SurveyClient schoolId="s1" surveyId="v1" initialData={{ ...data, questions: updatedQuestions, survey: { ...data.survey!, questions: updatedQuestions, items: updatedQuestions } }} />);
    expect(screen.getByText("3つまで選択できます")).toBeTruthy();
    expect(screen.queryByText("2つまで選択できます")).toBeNull();
    expect(data).toEqual(original);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps submit disabled until fetched questions arrive, then binds actual questions and role", async () => {
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    render(<SurveyClient schoolId="s 1" surveyId="v&1" />);
    expect(screen.getByRole("status").textContent).toContain("アンケート設問を読み込んでいます");
    expect((screen.getByRole("button", { name: "回答を送信する" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("radio", { name: "保護者様" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/public/survey-school?schoolId=s%201&surveyId=v%261", expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await act(async () => pending.resolve(Response.json(data)));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("保存済みアンケート");
    expect(screen.getByText("保存済み校舎")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "保護者様" }));
    fireEvent.click(screen.getByRole("radio", { name: "生徒ご本人様" }));
    expect((screen.getByRole("radio", { name: "保護者様" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "質問" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "環境" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "指導" }));
    expect((screen.getByRole("checkbox", { name: "指導" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "質問" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "指導" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "九州学院" } });
    fetchMock.mockResolvedValueOnce(Response.json({ review: "回答に沿った文章" })).mockResolvedValueOnce(Response.json({ success: true }));
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText("アンケート回答を保存しました。口コミ投稿用の文章を確認してください。");
    const input = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(input.selectedReasons).toEqual(["環境", "指導"]);
    expect(input.questionAnswers[0]).toMatchObject({ questionId: RESPONDENT_QUESTION_ID, value: "生徒ご本人様" });
    expect(input.freeText).toBe("九州学院");
    expect(input.keywords).toBe("個別指導");
  });

  it.each([
    [404, { message: "not found", questions: [] }],
    [500, { error: "database unavailable", school: { name: "実校舎" } }],
    [200, { questions: [] }],
  ])("does not invent questions for HTTP %s or empty records", async (status, body) => {
    fetchMock.mockResolvedValueOnce(Response.json(body, { status }));
    render(<SurveyClient schoolId="s1" surveyId="" />);
    await screen.findByText("設問データを取得できませんでした。");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect((screen.getByRole("button", { name: "回答を送信する" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/public/survey-school?schoolId=s1");
  });

  it("ends loading on invalid JSON without rendering a pretend form", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>upstream failure</html>"));
    render(<SurveyClient schoolId="s1" surveyId="v1" />);
    await screen.findByText("設問データを取得できませんでした。");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it.each([new Error("offline"), "network interrupted"])("ends loading on network rejection %#", async error => {
    fetchMock.mockRejectedValueOnce(error);
    render(<SurveyClient schoolId="s1" surveyId="v1" />);
    await screen.findByText("設問データを取得できませんでした。");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("aborts a timed-out request and releases loading", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")));
    }));
    render(<SurveyClient schoolId="s1" surveyId="v1" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(screen.getByText("設問データを取得できませんでした。")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("accepts the flat public question contract without a survey wrapper", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ school: data.school, questions }));
    render(<SurveyClient schoolId="s1" surveyId="v1" />);
    await screen.findByRole("textbox", { name: "高校はどこですか？" });
    expect(screen.getByText("保存済み校舎")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toContain("ご回答者様");
  });

  it("does not turn an empty SSR survey into a Q1-only questionnaire", () => {
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={{ ...data, survey: null, questions: [], success: false, message: "missing", error: "not found" }} />);
    expect(screen.getByText("設問データを取得できませんでした。")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])("ignores a late %s from a previous survey while the next one is loading", async outcome => {
    const previous = deferred<Response>();
    const current = deferred<Response>();
    fetchMock.mockReturnValueOnce(previous.promise).mockReturnValueOnce(current.promise);
    const view = render(<SurveyClient schoolId="s1" surveyId="v1" />);
    const oldSignal = fetchMock.mock.calls[0][1]?.signal;
    view.rerender(<SurveyClient schoolId="s2" surveyId="v2" />);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      if (outcome === "success") previous.resolve(Response.json(data));
      else previous.reject(new Error("obsolete failure"));
    });
    expect(screen.getByRole("status").textContent).toContain("アンケート設問を読み込んでいます");
    expect(screen.queryByRole("radio")).toBeNull();
    await act(async () => current.resolve(Response.json({ ...data, schoolName: "次の校舎", survey: { ...data.survey, title: "次のアンケート" } })));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("次のアンケート");
    expect(screen.getByText("次の校舎")).toBeTruthy();
    expect(screen.queryByText("設問データを取得できませんでした。")).toBeNull();
  });
});

describe("public survey submission results", () => {
  it.each([2, 5])("keeps user answers and shows no success when saving rating %s fails, then allows retry", async rating => {
    fetchMock.mockImplementation(async url => url === "/api/generate-review" ? Response.json({ review: "生成した口コミ" }) : Response.json({ message: "保存に失敗しました" }, { status: 500 }));
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    fireEvent.click(screen.getByRole("button", { name: String(rating) }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "済々黌" } });
    chooseAndSubmit();
    await screen.findByText("保存に失敗しました");
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
    expect(screen.queryByText(/アンケート回答を保存しました/)).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("済々黌");
    expect((screen.getByRole("radio", { name: "生徒ご本人様" }) as HTMLInputElement).checked).toBe(true);
    fetchMock.mockImplementation(async url => Response.json(url === "/api/generate-review" ? { review: "再生成した口コミ" } : { success: true }));
    fireEvent.click(screen.getByRole("button", { name: "回答を送信する" }));
    await screen.findByText(/アンケート回答を保存しました/);
    expect(screen.queryByText("保存に失敗しました")).toBeNull();
  });

  it.each([2, 5])("uses a clear save error when the failed response has no message (rating %s)", async rating => {
    fetchMock.mockImplementation(async url => url === "/api/generate-review" ? Response.json({ review: "生成した口コミ" }) : Response.json({}, { status: 500 }));
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    fireEvent.click(screen.getByRole("button", { name: String(rating) }));
    chooseAndSubmit();
    await screen.findByText("アンケート回答を保存できませんでした。");
  });

  it.each([
    new Response(JSON.stringify({ message: "接続設定が未完了です" }), { status: 503 }),
    new Response("{}", { status: 502 }),
  ])("does not save a response after generation HTTP failure %#", async response => {
    fetchMock.mockResolvedValueOnce(response);
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    chooseAndSubmit();
    await waitFor(() => expect((screen.getByRole("button", { name: "回答を送信する" }) as HTMLButtonElement).disabled).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
  });

  it("handles a non-Error rejection without claiming success", async () => {
    fetchMock.mockRejectedValueOnce("offline");
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    chooseAndSubmit();
    await screen.findByText("口コミ生成または回答保存に失敗しました。入力内容を確認して再度お試しください。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { review: " " }, { review: 42 }, { reviews: ["legacy result"] }])("rejects malformed generation instead of persisting an empty or substituted review %#", async result => {
    fetchMock.mockResolvedValueOnce(Response.json(result));
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    chooseAndSubmit();
    await screen.findByText("生成結果を確認できませんでした。再度お試しください。");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
  });

  it("does not expose a posting action before answer persistence completes", async () => {
    const saving = deferred<Response>();
    fetchMock.mockResolvedValueOnce(Response.json({ review: "回答に沿った文章" })).mockReturnValueOnce(saving.promise);
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    chooseAndSubmit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "コピーして投稿画面へ" })).toBeNull();
    await act(async () => saving.resolve(Response.json({ success: true })));
    expect(screen.getByRole("button", { name: "コピーして投稿画面へ" })).toBeTruthy();
  });

  it("reports clipboard refusal without opening Google or announcing copy success", async () => {
    const writeText = vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fetchMock.mockResolvedValueOnce(Response.json({ review: "回答に沿った文章" })).mockResolvedValueOnce(Response.json({ success: true }));
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    chooseAndSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "コピーして投稿画面へ" }));
    await screen.findByText("コピーできませんでした。ブラウザのクリップボード権限を確認してください。");
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText("コピー完了")).toBeNull();
  });

  it("disables repeated submission while sending and copies the generated text to the saved destination", async () => {
    const pending = deferred<Response>();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(Response.json({ success: true }));
    render(<SurveyClient schoolId="s1" surveyId="v1" initialData={data} />);
    chooseAndSubmit();
    const sending = screen.getByRole("button", { name: "送信中..." }) as HTMLButtonElement;
    expect(sending.disabled).toBe(true);
    fireEvent.click(sending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(Response.json({ review: "実際に生成された文章" })));
    fireEvent.click(screen.getByRole("button", { name: "コピーして投稿画面へ" }));
    await screen.findByText("コピー完了");
    expect(writeText).toHaveBeenCalledWith("実際に生成された文章");
    expect(open).toHaveBeenCalledWith(data.googleReviewUrl, "_blank", "noopener,noreferrer");
    expect(screen.getByText("コピー済み")).toBeTruthy();
  });
});
