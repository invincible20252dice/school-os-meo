// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyEditor from "./survey-editor";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=school-1"), session: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: mocks.session } }) }));

const survey = {
  id: "survey-1", schoolId: "school-1", title: "保存済みアンケート", requiredKeywords: "", minCharCount: 100, maxCharCount: 300,
  isValid: false, hasIncentive: false, benefitType: "", benefitShowTiming: "", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
  items: [
    { id: "q1", type: "SINGLE_CHOICE", question: "きっかけ", options: ["受験対策", "学習習慣"], order: 1 },
    { id: "q2", type: "MULTIPLE_CHOICE", question: "良かった点", options: ["説明", "自習室"], maxSelect: 2, order: 2 },
  ],
};
const textareas = () => screen.getAllByRole("textbox", { name: "選択肢（改行区切り）" }) as HTMLTextAreaElement[];
const loaded = (row = survey) => Response.json({ surveys: [row], access: { effectiveSchoolId: "school-1" } });
beforeEach(() => {
  mocks.params = new URLSearchParams("schoolId=school-1");
  mocks.session.mockReset().mockResolvedValue({ data: { session: { access_token: "session-token" } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(loaded()));
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const change = (name: string, value: string, role = "textbox") =>
  fireEvent.change(screen.getByRole(role, { name, exact: true }), { target: { value } });
const savedCard = (title: string) => within(screen.getByText(title, { selector: "article strong" }).closest("article")!);

describe("survey editor workflow", () => {
  it("does not start a request when session resolution finishes after unmount", async () => {
    const session = deferred<{ data: { session: null } }>();
    mocks.session.mockReturnValue(session.promise);
    const view = render(<SurveyEditor surveyId="survey-1" />);
    view.unmount();
    await act(async () => session.resolve({ data: { session: null } }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts the in-flight request when the editor unmounts", async () => {
    const pending = deferred<Response>();
    const network = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", network);
    const view = render(<SurveyEditor surveyId="survey-1" />);
    await waitFor(() => expect(network).toHaveBeenCalledOnce());
    const signal = network.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new DOMException("Aborted", "AbortError")));
  });

  it.each(["success", "failure"])("ignores a stale %s after switching surveys", async outcome => {
    const old = deferred<Response>();
    const network = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(loaded({ ...survey, id: "survey-2", title: "次のアンケート" }));
    vi.stubGlobal("fetch", network);
    const view = render(<SurveyEditor surveyId="survey-1" />);
    await waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    view.rerender(<SurveyEditor surveyId="survey-2" />);
    await screen.findByText("次のアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "新しい入力\n\n" } });
    await act(async () => {
      if (outcome === "success") old.resolve(loaded());
      else old.reject(new Error("古いリクエストの失敗"));
    });
    expect((screen.getByRole("textbox", { name: "アンケート名" }) as HTMLInputElement).value).toBe("次のアンケート");
    expect(textareas()[0].value).toBe("新しい入力\n\n");
    expect(screen.getByText("次のアンケートをDBから読み込みました。")).toBeDefined();
    expect(savedCard("次のアンケート")).toBeDefined();
  });

  it("keeps the loading state for the latest school even when the previous request finishes first", async () => {
    const old = deferred<Response>();
    const current = deferred<Response>();
    const network = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    vi.stubGlobal("fetch", network);
    const view = render(<SurveyEditor surveyId="new" />);
    await waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    mocks.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<SurveyEditor surveyId="new" />);
    await waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(loaded()));
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "アンケート名" })).toBeNull();
    await act(async () => current.resolve(Response.json({ surveys: [] })));
    expect(screen.getByText("新規アンケート作成")).toBeDefined();
    expect(network.mock.calls[1][0]).toBe("/api/surveys?schoolId=school-2");
  });

  it("hides editable defaults until the requested record has loaded", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    render(<SurveyEditor surveyId="survey-1" />);
    expect(screen.getByRole("status").textContent).toContain("DBからアンケート設定を読み込んでいます");
    expect(screen.queryByRole("textbox", { name: "アンケート名" })).toBeNull();
    await act(async () => pending.resolve(loaded()));
    expect((screen.getByRole("textbox", { name: "アンケート名" }) as HTMLInputElement).value).toBe(survey.title);
    expect(fetch).toHaveBeenCalledWith("/api/surveys?schoolId=school-1&id=survey-1", expect.objectContaining({ cache: "no-store", headers: { Authorization: "Bearer session-token" } }));
  });

  it("edits all generation fields and posts the latest values while disabling duplicate saves", async () => {
    const pending = deferred<Response>();
    const network = vi.fn().mockResolvedValueOnce(loaded()).mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", network);
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    change("含めたいキーワード", "個別指導, 大学受験");
    change("最小文字数", "150", "spinbutton");
    change("最大文字数", "250", "spinbutton");
    fireEvent.click(screen.getByRole("checkbox", { name: "アンケートを有効化" }));
    fireEvent.click(screen.getByRole("button", { name: "月", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "土", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "特典をつける", exact: true }));
    expect(screen.getByText("特典名未設定")).toBeDefined();
    expect(screen.getByText("表示タイミング未設定")).toBeDefined();
    change("特典", "資料配布");
    change("特典表示タイミング", "アンケート完了後", "combobox");
    change("最大選択数", "1", "spinbutton");
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    expect((screen.getByRole("button", { name: "保存中..." }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "保存中..." }));
    await waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    expect(JSON.parse(network.mock.calls[1][1].body)).toMatchObject({
      requiredKeywords: "個別指導, 大学受験", minCharCount: 150, maxCharCount: 250, isValid: true,
      activeWeekdays: ["火", "水", "木", "金", "土"], hasIncentive: true,
      benefitType: "資料配布", benefitShowTiming: "アンケート完了後",
      items: [{ id: "q1" }, { id: "q2", maxSelect: 1 }],
    });
    await act(async () => pending.resolve(Response.json({ survey: { id: "survey-1" } })));
    expect(savedCard(survey.title).getByText("特典あり")).toBeDefined();
    expect(savedCard(survey.title).getByText("適用中")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "特典をつけない", exact: true }));
    expect(screen.queryByRole("textbox", { name: "特典", exact: true })).toBeNull();
  });

  it("adds and moves questions, edits free-text hints, and previews the new order", async () => {
    render(<SurveyEditor surveyId="new" />);
    await screen.findByText("新規アンケート作成");
    fireEvent.click(screen.getByRole("button", { name: "設問を追加" }));
    const questions = screen.getAllByRole("textbox", { name: "設問文", exact: true }) as HTMLInputElement[];
    expect(questions).toHaveLength(3);
    fireEvent.change(questions[2], { target: { value: "追加した質問" } });
    fireEvent.click(screen.getByRole("button", { name: "設問 3 を上に移動" }));
    expect(screen.getAllByRole("textbox", { name: "設問文", exact: true }).map(el => (el as HTMLInputElement).value)).toEqual([
      "良かったと感じた点を選んでください", "追加した質問", "印象に残っている変化を教えてください",
    ]);
    change("入力例（プレースホルダー）", "体験を入力してください");
    expect(within(screen.getByRole("complementary")).getByText("体験を入力してください")).toBeDefined();
    expect(within(screen.getByRole("complementary")).getAllByRole("heading", { level: 3 }).map(el => el.textContent)).toEqual([
      "良かったと感じた点を選んでください", "追加した質問", "印象に残っている変化を教えてください",
    ]);
    expect((screen.getByRole("button", { name: "設問 1 を上に移動" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "設問 3 を下に移動" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("switches between saved and new settings without carrying edited choice text", async () => {
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "未保存\n" } });
    fireEvent.click(screen.getByRole("button", { name: "編集内容を破棄" }));
    expect(screen.getByText("新規作成モードに切り替えました。")).toBeDefined();
    expect(textareas()[0].value).not.toContain("未保存");
    fireEvent.click(savedCard(survey.title).getByRole("button", { name: "編集", exact: true }));
    expect(textareas()[0].value).toBe("受験対策\n学習習慣");
    expect(screen.getByText(`${survey.title}を編集中です。`)).toBeDefined();
  });

  it("creates a new record using the server ID and retains its options after reselecting it", async () => {
    const network = vi.fn().mockResolvedValueOnce(Response.json({ surveys: [] })).mockResolvedValueOnce(Response.json({ survey: { id: "created-survey" } }));
    vi.stubGlobal("fetch", network);
    render(<SurveyEditor surveyId="new" />);
    await screen.findByText("新規アンケート作成");
    change("アンケート名", "作成テスト");
    fireEvent.change(textareas()[0], { target: { value: "A\n\nB\n" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await screen.findByText("アンケート設定をDBへ保存しました。");
    expect(JSON.parse(network.mock.calls[1][1].body)).toMatchObject({ id: "new", schoolId: "school-1", items: [{ options: ["A", "B"] }, { type: "TEXT" }] });
    fireEvent.click(screen.getByRole("button", { name: "編集内容を破棄" }));
    fireEvent.click(savedCard("作成テスト").getByRole("button", { name: "編集", exact: true }));
    expect(textareas()[0].value).toBe("A\nB");
    expect(screen.getByRole("button", { name: "更新する" })).toBeDefined();
  });

  it.each([
    ["HTTP rejection", () => Promise.resolve(Response.json({}, { status: 403 }))],
    ["missing saved ID", () => Promise.resolve(Response.json({ survey: {} }))],
    ["missing survey", () => Promise.resolve(Response.json({}))],
    ["network rejection", () => Promise.reject("offline")],
  ])("does not claim persistence after %s", async (_label, failure) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(loaded()).mockImplementationOnce(failure));
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "保存されていない\n" } });
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    await screen.findByText("アンケート設定を保存できませんでした。");
    expect(textareas()[0].value).toBe("保存されていない\n");
    expect((screen.getByRole("button", { name: "更新する" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("アンケート設定をDBへ保存しました。")).toBeNull();
  });

  it.each([
    ["HTTP", () => Promise.resolve(Response.json({}, { status: 500 })), "アンケート設定を取得できませんでした。"],
    ["message", () => Promise.resolve(Response.json({ message: "校舎へのアクセスがありません" }, { status: 403 })), "校舎へのアクセスがありません"],
    ["network", () => Promise.reject("offline"), "アンケート設定を取得できませんでした。"],
  ])("ends loading and reports a %s failure", async (_label, response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(response));
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText(message);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("保存済みアンケートをDBから読み込みました。")).toBeNull();
  });

  it("does not send a fabricated Authorization header when there is no session", async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 401 })));
    render(<SurveyEditor surveyId="new" />);
    await screen.findByText("アンケート設定を取得できませんでした。");
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ headers: {} }));
  });

  it.each([
    [{ surveys: [], access: { effectiveSchoolId: "assigned-school" } }, "assigned-school"],
    [{ surveys: [survey] }, "school-1"],
    [{}, ""],
  ])("uses the resolved school for new surveys without a URL selection", async (response, schoolId) => {
    mocks.params = new URLSearchParams();
    const network = vi.fn().mockResolvedValueOnce(Response.json(response)).mockResolvedValueOnce(Response.json({ survey: { id: "created" } }));
    vi.stubGlobal("fetch", network);
    render(<SurveyEditor surveyId="new" />);
    await screen.findByText("新規アンケート作成");
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await screen.findByText("アンケート設定をDBへ保存しました。");
    expect(network.mock.calls[0][0]).toBe("/api/surveys?");
    expect(JSON.parse(network.mock.calls[1][1].body).schoolId).toBe(schoolId);
  });

  it("reports a missing requested survey instead of selecting a different record", async () => {
    render(<SurveyEditor surveyId="missing" />);
    await screen.findByText("対象のアンケート設定が見つかりませんでした。");
    expect((screen.getByRole("textbox", { name: "アンケート名" }) as HTMLInputElement).value).not.toBe(survey.title);
  });

  it("loads persisted question types, hints, and order into the actual form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(loaded({ ...survey, createdAt: "invalid", updatedAt: "invalid", items: [
      { ...survey.items[0], id: "free", type: "FREE_TEXT", question: "学校名", options: [], order: 4, placeholder: "例: 高校名" },
      { ...survey.items[0], id: "single", type: "SINGLE_SELECT", order: 0 },
      { ...survey.items[0], id: "multi", type: "MULTI_SELECT", order: 1 },
      { ...survey.items[0], id: "text", type: "TEXT", order: 2 },
      { ...survey.items[0], id: "unknown", type: "UNKNOWN", order: 3 },
    ] } as typeof survey)));
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    expect(screen.getAllByRole("combobox", { name: "設問タイプ" }).map(el => (el as HTMLSelectElement).value)).toEqual(["SINGLE_SELECT", "MULTI_SELECT", "TEXT", "TEXT", "TEXT"]);
    expect((screen.getByRole("spinbutton", { name: "最大選択数" }) as HTMLInputElement).value).toBe("3");
    expect(screen.getAllByRole("textbox", { name: "入力例（プレースホルダー）" }).map(el => (el as HTMLInputElement).value)).toEqual(["", "", "例: 高校名"]);
    expect(savedCard(survey.title).getByText("作成日時 日時なし")).toBeDefined();
  });

  it("applies selection to the matching card only and blocks deleting the active selection", async () => {
    const other = { ...survey, id: "survey-2", title: "別設定" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ surveys: [survey, other] })));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.click(savedCard(other.title).getByRole("button", { name: "選択", exact: true }));
    expect(savedCard(other.title).getByText("適用中")).toBeDefined();
    expect(within(screen.getByRole("complementary")).getByText("停止中")).toBeDefined();
    fireEvent.click(savedCard(other.title).getByRole("button", { name: "削除", exact: true }));
    expect(screen.getByText("適用中のアンケートは削除できません。先に別のアンケートを選択してください。")).toBeDefined();
    fireEvent.click(savedCard(survey.title).getByRole("button", { name: "選択", exact: true }));
    expect(savedCard(survey.title).getByText("適用中")).toBeDefined();
    expect(within(screen.getByRole("complementary")).getByText("公開中")).toBeDefined();
  });

  it("honors deletion cancellation and resets only the deleted active editor", async () => {
    const other = { ...survey, id: "survey-2", title: "別設定" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ surveys: [survey, other] })));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.click(savedCard(survey.title).getByRole("button", { name: "削除", exact: true }));
    expect(confirm).toHaveBeenCalledWith("このアンケートを削除してもよろしいですか？");
    expect(savedCard(survey.title)).toBeDefined();
    fireEvent.click(savedCard(other.title).getByRole("button", { name: "削除", exact: true }));
    expect(screen.queryByText(other.title, { selector: "article strong" })).toBeNull();
    expect((screen.getByRole("textbox", { name: "アンケート名" }) as HTMLInputElement).value).toBe(survey.title);
    fireEvent.click(savedCard(survey.title).getByRole("button", { name: "削除", exact: true }));
    expect(screen.queryByText(survey.title, { selector: "article strong" })).toBeNull();
    expect(screen.getByText("新規アンケート作成")).toBeDefined();
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("survey option editing", () => {
  it.each([0, 1])("preserves trailing Enter and blank lines for choice type %s", async index => {
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    const original = textareas()[index].value;
    for (const suffix of ["\n", "\n\n", "\n\n  新しい選択肢  \n"]) {
      fireEvent.change(textareas()[index], { target: { value: original + suffix } });
      expect(textareas()[index].value).toBe(original + suffix);
    }
    fireEvent.blur(textareas()[index]);
    expect(textareas()[index].value).toBe(original + "\n\n  新しい選択肢  \n");
    const preview = within(screen.getByRole("complementary"));
    expect(preview.getByRole("button", { name: "新しい選択肢", exact: true })).toBeDefined();
    expect(preview.queryByRole("button", { name: "", exact: true })).toBeNull();
  });

  it("keeps leading spaces, blank lines, and IME composition text while editing", async () => {
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    const raw = "\n  入塾のきっかけ  \n\n　大学受験　\n";
    fireEvent.compositionStart(textareas()[0]);
    fireEvent.change(textareas()[0], { target: { value: raw } });
    fireEvent.compositionEnd(textareas()[0]);
    expect(textareas()[0].value).toBe(raw);
    fireEvent.change(screen.getByRole("textbox", { name: "アンケート名" }), { target: { value: "変更後" } });
    expect(textareas()[0].value).toBe(raw);
    expect(within(screen.getByRole("complementary")).getByRole("button", { name: "大学受験", exact: true })).toBeDefined();
  });

  it("keeps each option draft attached to its question when reordering and deleting", async () => {
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "先頭の設問\n\n" } });
    fireEvent.change(textareas()[1], { target: { value: "二番目の設問\n" } });
    fireEvent.click(screen.getByRole("button", { name: "設問 1 を下に移動" }));
    expect(textareas().map(area => area.value)).toEqual(["二番目の設問\n", "先頭の設問\n\n"]);
    fireEvent.click(within(textareas()[0].closest("article")!).getByRole("button", { name: "削除", exact: true }));
    expect(textareas()).toHaveLength(1);
    expect(textareas()[0].value).toBe("先頭の設問\n\n");
  });

  it("posts normalized options in order, without requiring blur before save", async () => {
    const network = vi.fn().mockResolvedValueOnce(loaded()).mockResolvedValueOnce(Response.json({ survey: { id: "survey-1" } }));
    vi.stubGlobal("fetch", network);
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "\n 選択A \n\n選択B\n" } });
    fireEvent.click(screen.getByRole("button", { name: "設問 1 を下に移動" }));
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    await screen.findByText("アンケート設定をDBへ保存しました。");
    const [url, request] = network.mock.calls[1];
    expect(url).toBe("/api/surveys");
    expect(request.headers.Authorization).toBe("Bearer session-token");
    expect(JSON.parse(request.body)).toMatchObject({ id: "survey-1", schoolId: "school-1", items: [
      { id: "q2", order: 1, options: ["説明", "自習室"] },
      { id: "q1", order: 2, options: ["選択A", "選択B"] },
    ] });
  });

  it("does not count whitespace-only lines as valid choices", async () => {
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: " \n\n　\n" } });
    expect(textareas()[0].value).toBe(" \n\n　\n");
    expect(screen.getByText("1番目の選択肢を1つ以上入力してください。")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    await screen.findByText("入力内容を確認してください。");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves unsaved raw text after a failed save", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(loaded()).mockResolvedValueOnce(Response.json({ message: "保存失敗" }, { status: 500 })));
    render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "残す選択肢\n\n" } });
    fireEvent.click(screen.getByRole("button", { name: "更新する" }));
    await screen.findByText("保存失敗");
    expect(textareas()[0].value).toBe("残す選択肢\n\n");
  });

  it("replaces option text when loading another survey with the same question IDs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(loaded()).mockResolvedValueOnce(loaded({ ...survey, id: "survey-2", title: "別アンケート", items: [{ ...survey.items[0], options: ["別の選択肢"] }] })));
    const view = render(<SurveyEditor surveyId="survey-1" />);
    await screen.findByText("保存済みアンケートをDBから読み込みました。");
    fireEvent.change(textareas()[0], { target: { value: "古い入力\n" } });
    view.rerender(<SurveyEditor surveyId="survey-2" />);
    await screen.findByText("別アンケートをDBから読み込みました。");
    expect(textareas()[0].value).toBe("別の選択肢");
  });

  it("supports normal new-survey typing and clears choices when converting to free text", async () => {
    render(<SurveyEditor surveyId="new" />);
    await screen.findByText("新規アンケート作成");
    fireEvent.change(textareas()[0], { target: { value: "新規選択肢\n" } });
    expect(textareas()[0].value).toBe("新規選択肢\n");
    const type = screen.getAllByRole("combobox", { name: "設問タイプ" })[0];
    fireEvent.change(type, { target: { value: "TEXT" } });
    expect(screen.queryByRole("textbox", { name: "選択肢（改行区切り）" })).toBeNull();
    fireEvent.change(type, { target: { value: "SINGLE_SELECT" } });
    expect(textareas()[0].value).toBe("");
  });
});
