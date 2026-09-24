// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/surveys/route";
import { serializePublicSurvey } from "@/lib/public-survey-query";
import SurveyEditor from "./survey-editor";

const boundary = vi.hoisted(() => ({
  params: new URLSearchParams("schoolId=school-1"),
  db: {
    school: { findUnique: vi.fn() },
    survey: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    surveySetting: { findMany: vi.fn() },
    surveyItem: { deleteMany: vi.fn(), createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => boundary.params }));
vi.mock("@/lib/prisma", () => ({ prisma: boundary.db }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-session" } } }) } }) }));
vi.mock("@/lib/supabase-access", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabase-access")>(),
  resolveRequestAccess: async (request: Request) => {
    expect(request.headers.get("Authorization")).toBe("Bearer test-session");
    return {
      isAuthenticated: true,
      access: { userId: "manager-1", role: "manager", schoolId: "school-1", schoolIds: ["school-1"], name: "教室長", email: "manager@example.com", status: "active", source: "profiles" },
    };
  },
}));

type StoredItem = { id: string; type: string; question: string; options: string[]; order: number; placeholder: string | null; maxSelect: number | null };
const fixture = () => ({
  id: "survey-1", schoolId: "school-1", title: "保存済み設定", requiredKeywords: "個別指導", minCharCount: 100, maxCharCount: 300,
  isValid: false, benefitType: null as string | null, benefitShowTiming: null as string | null,
  createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"),
  school: { id: "school-1", name: "テスト校舎", googlePlaceId: null, googleMapsUrl: null },
  items: [
    { id: "q1", type: "SINGLE_SELECT", question: "通塾のきっかけ", options: ["受験対策", "学習習慣"], order: 1, placeholder: null, maxSelect: null },
    { id: "q2", type: "MULTI_SELECT", question: "良かった点", options: ["説明", "自習室"], order: 2, placeholder: null, maxSelect: 2 },
  ] as StoredItem[],
});
let stored = fixture();

beforeEach(() => {
  vi.clearAllMocks();
  stored = fixture();
  boundary.db.school.findUnique.mockResolvedValue({ id: "school-1" });
  boundary.db.surveySetting.findMany.mockResolvedValue([]);
  boundary.db.survey.findMany.mockImplementation(async () => [structuredClone(stored)]);
  boundary.db.survey.update.mockImplementation(async ({ where, data }) => {
    expect(where).toEqual({ id: "survey-1" });
    stored = { ...stored, ...data };
    return { id: stored.id };
  });
  boundary.db.survey.create.mockImplementation(async ({ data }) => {
    stored = { ...fixture(), ...data, id: "created-survey", items: [] };
    return { id: stored.id };
  });
  boundary.db.surveyItem.deleteMany.mockResolvedValue({ count: 2 });
  boundary.db.surveyItem.createMany.mockImplementation(async ({ data }: { data: Array<Omit<StoredItem, "id"> & { surveyId: string }> }) => {
    expect(data.every(item => item.surveyId === stored.id)).toBe(true);
    stored.items = data.map((item, index) => ({ ...item, id: `persisted-${index}` }));
    return { count: data.length };
  });
  boundary.db.$transaction.mockImplementation(async operations => Promise.all(operations));
  // Exercise the real route, authorization scope, normalization, and persistence.
  // Only the network/session/Prisma boundaries are substituted.
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const request = new Request(new URL(url, "https://school.test"), init);
    return request.method === "POST" ? POST(request) : GET(request);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("survey editor persistence integration", () => {
  it.each(["survey-1", "new"])("preserves option order through %s save, reload, and public serialization", async id => {
    const view = render(<SurveyEditor surveyId={id} />);
    await screen.findByText(id === "new" ? "新規アンケート作成" : "保存済み設定をDBから読み込みました。");
    const input = screen.getAllByRole("textbox", { name: "選択肢（改行区切り）" })[0];
    fireEvent.change(input, { target: { value: "\n  対策A  \n\n対策B\n" } });
    fireEvent.click(screen.getByRole("button", { name: "設問 1 を下に移動" }));
    fireEvent.click(screen.getByRole("button", { name: id === "new" ? "保存する" : "更新する" }));
    await screen.findByText("アンケート設定をDBへ保存しました。");
    expect(boundary.db.survey[id === "new" ? "create" : "update"]).toHaveBeenCalledOnce();
    expect(boundary.db.survey[id === "new" ? "update" : "create"]).not.toHaveBeenCalled();
    expect(stored.schoolId).toBe("school-1");
    expect(stored.items.map(item => item.order)).toEqual([1, 2]);
    expect(stored.items[1].options).toEqual(["対策A", "対策B"]);
    expect(boundary.db.surveyItem.deleteMany).toHaveBeenCalledWith({ where: { surveyId: stored.id } });
    expect(boundary.db.$transaction).toHaveBeenCalledOnce();

    view.unmount();
    render(<SurveyEditor surveyId={stored.id} />);
    await screen.findByText(`${stored.title}をDBから読み込みました。`);
    const choices = screen.getAllByRole("textbox", { name: "選択肢（改行区切り）" }) as HTMLTextAreaElement[];
    expect(choices.at(-1)?.value).toBe("対策A\n対策B");
    const preview = within(screen.getByRole("complementary"));
    expect(preview.getByRole("button", { name: "対策A", exact: true })).toBeDefined();
    expect(preview.getAllByRole("heading", { level: 3 }).map(el => el.textContent)).toEqual(stored.items.map(item => item.question));
    const published = serializePublicSurvey(stored);
    expect(published.questions.map(item => item.title)).toEqual(stored.items.map(item => item.question));
    expect(published.questions[1].options).toEqual(["対策A", "対策B"]);
  });
});
