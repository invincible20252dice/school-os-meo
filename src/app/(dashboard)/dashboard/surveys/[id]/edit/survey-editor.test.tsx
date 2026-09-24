// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SurveyEditor from "./survey-editor";

const params = vi.hoisted(() => new URLSearchParams("schoolId=school-1"));
vi.mock("next/navigation", () => ({ useSearchParams: () => params }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "session-token" } } }) } }) }));

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
beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(loaded())));
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
