// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma, Review, School } from "@prisma/client";
import type { resolveRequestAccess } from "@/lib/supabase-access";
import type { ReviewAnalysis } from "@/lib/review-analytics";
import { GET } from "@/app/api/dashboard/reviews/analytics/route";
import ReviewAnalyticsClient from "./review-analytics-client";

type ReviewSource = Pick<Review, "id" | "comment" | "originalText">;
const boundary = vi.hoisted(() => ({
  params: new URLSearchParams("schoolId=s1"),
  session: vi.fn(),
  access: vi.fn<typeof resolveRequestAccess>(),
  schools: vi.fn<(args: Prisma.SchoolFindManyArgs) => Promise<Pick<School, "id" | "name">[]>>(),
  reviews: vi.fn<(args: Prisma.ReviewFindManyArgs) => Promise<ReviewSource[]>>(),
  count: vi.fn<(args: Prisma.ReviewCountArgs) => Promise<number>>(),
  provider: vi.fn<typeof fetch>(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => boundary.params }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: boundary.session } }) }));
vi.mock("@/lib/supabase-access", () => ({ resolveRequestAccess: boundary.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { school: { findMany: boundary.schools }, review: { findMany: boundary.reviews, count: boundary.count } } }));

const identity: Awaited<ReturnType<typeof resolveRequestAccess>> = {
  isAuthenticated: true,
  access: { userId: "u1", role: "manager", schoolId: "s1", schoolIds: ["s1"], status: "active", name: "担当者", email: "test@example.com", source: "profiles" },
};
const sources: ReviewSource[] = [
  { id: "r1", comment: "  説明が丁寧。  ", originalText: "古い本文" },
  { id: "r2", comment: null, originalText: "Long wait. Fair price." },
  { id: "r3", comment: " ", originalText: null },
];
const analyses: ReviewAnalysis[] = [
  { reviewId: "r1", language: "ja", opinions: [{ category: "指導品質・講師対応", sentiment: "positive", quote: "説明が丁寧" }] },
  { reviewId: "r2", language: "en", opinions: [
    { category: "運営・連絡", sentiment: "negative", quote: "Long wait" },
    { category: "料金", sentiment: "neutral", quote: "Fair price" },
  ] },
];
const completion = (reviews: unknown = analyses) => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reviews }) }] }] });
const statuses: number[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "integration-test-key");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  boundary.params = new URLSearchParams("schoolId=s1");
  boundary.session.mockResolvedValue({ data: { session: { access_token: "test-session" } } });
  boundary.access.mockResolvedValue(identity);
  boundary.schools.mockResolvedValue([{ id: "s1", name: "校舎A" }]);
  boundary.reviews.mockResolvedValue(sources);
  boundary.count.mockResolvedValue(3);
  boundary.provider.mockImplementation(async () => completion());
  statuses.length = 0;
  // Dispatch the browser request to the real route; only OpenAI's HTTP boundary is substituted.
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    if (typeof input === "string" && input.startsWith("/api/dashboard/reviews/analytics")) {
      const response = await GET(new Request(`https://school.test${input}`, init));
      statuses.push(response.status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      return response;
    }
    if (input === "https://api.openai.com/v1/responses") return boundary.provider(input, init);
    throw new Error(`Unexpected network request: ${String(input)}`);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("review analysis: UI -> API -> source text -> AI validation -> UI", () => {
  it("binds source quotes, real denominators, language filters and scoped links through the complete pipeline", async () => {
    render(<ReviewAnalyticsClient />);
    expect(screen.getByRole("status")).toBeDefined();
    await screen.findByText("校舎A / Google口コミ 3件");
    expect(statuses).toEqual([200]);
    expect(boundary.access.mock.calls[0][0].headers.get("authorization")).toBe("Bearer test-session");
    const scope = { schoolId: { in: ["s1"] }, source: "GOOGLE", status: { not: "ARCHIVED" } };
    expect(boundary.reviews).toHaveBeenCalledWith({ where: scope, select: { id: true, comment: true, originalText: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50 });
    expect(boundary.count).toHaveBeenCalledWith({ where: scope });
    const init = boundary.provider.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ Authorization: "Bearer integration-test-key" });
    const payload = JSON.parse(String(init?.body));
    expect(JSON.parse(payload.input)).toEqual([{ id: "r1", text: "説明が丁寧。" }, { id: "r2", text: "Long wait. Fair price." }]);
    expect(payload.store).toBe(false);
    expect(screen.getByText(/本文あり 2件 \/ 本文なし 1件/)).toBeDefined();
    for (const label of ["ポジティブ", "中立", "ネガティブ"]) expect(screen.getByText(`${label} 33.3%`)).toBeDefined();
    expect(screen.getAllByRole("link", { name: "元の口コミを確認" }).map(link => link.getAttribute("href"))).toEqual([
      "/dashboard/reviews?schoolId=s1&reviewId=r1", "/dashboard/reviews?schoolId=s1&reviewId=r2", "/dashboard/reviews?schoolId=s1&reviewId=r2",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "日本語 1" }));
    expect(screen.getByText("ポジティブ 100%")).toBeDefined();
    expect(screen.queryByText("Long wait")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "英語 1" }));
    expect(screen.getByText("ネガティブ 50%")).toBeDefined();
    expect(screen.getByText("中立 50%")).toBeDefined();
    expect(boundary.provider).toHaveBeenCalledTimes(1);
  });

  it.each(["empty", "ratings-only"])("renders %s honestly and does not call AI", async kind => {
    boundary.reviews.mockResolvedValue(kind === "empty" ? [] : [sources[2]]);
    boundary.count.mockResolvedValue(kind === "empty" ? 0 : 1);
    render(<ReviewAnalyticsClient />);
    await screen.findByText(kind === "empty" ? "Google口コミはまだ登録されていません。" : "この条件で分析できる意見はありません。");
    expect(statuses).toEqual([200]);
    expect(boundary.provider).not.toHaveBeenCalled();
    expect(screen.getByText("ポジティブ 0%")).toBeDefined();
    expect(screen.getByRole("img", { name: "意見分布データなし" })).toBeDefined();
  });

  it.each(["expired", "pending", "foreign-school"])("denies %s before reading any review or calling AI", async kind => {
    if (kind === "expired") boundary.access.mockResolvedValue({ ...identity, isAuthenticated: false });
    else if (kind === "pending") boundary.access.mockResolvedValue({ ...identity, access: { ...identity.access, status: "pending" } });
    else boundary.params = new URLSearchParams("schoolId=s2");
    render(<ReviewAnalyticsClient />);
    await screen.findByRole("alert");
    expect(statuses).toEqual([kind === "expired" ? 401 : 403]);
    expect(boundary.schools).not.toHaveBeenCalled();
    expect(boundary.reviews).not.toHaveBeenCalled();
    expect(boundary.provider).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("説明が丁寧")).toBeNull();
  });

  it.each(["database", "quota", "ungrounded", "missing-review", "duplicate-review", "missing-key"])("surfaces %s as an error and recovers only after an explicit retry", async kind => {
    if (kind === "database") boundary.reviews.mockRejectedValueOnce(new Error("P2022 private SQL"));
    else if (kind === "quota") boundary.provider.mockResolvedValueOnce(Response.json({ error: { message: "private provider detail" } }, { status: 429 }));
    else if (kind === "ungrounded") boundary.provider.mockResolvedValueOnce(completion([
      { ...analyses[0], opinions: [{ category: "成果実感・成績向上", sentiment: "positive", quote: "成績が上がった" }] }, analyses[1],
    ]));
    else if (kind === "missing-review") boundary.provider.mockResolvedValueOnce(completion([analyses[0]]));
    else if (kind === "duplicate-review") boundary.provider.mockResolvedValueOnce(completion([analyses[0], analyses[0]]));
    else vi.stubEnv("OPENAI_API_KEY", "");
    render(<ReviewAnalyticsClient />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toMatch(/private|P2022/);
    expect(statuses).toEqual([kind === "database" ? 500 : kind === "missing-key" ? 503 : 502]);
    expect(screen.queryByText("ポジティブ 100%")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("説明が丁寧")).toBeNull();
    expect(boundary.reviews).toHaveBeenCalledTimes(1);
    vi.stubEnv("OPENAI_API_KEY", "integration-test-key");
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    await screen.findByText("説明が丁寧");
    expect(statuses.at(-1)).toBe(200);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("ネガティブ 33.3%")).toBeDefined();
    expect(boundary.reviews).toHaveBeenCalledTimes(2);
  });

  it("shows the 50-review sample independently of the total database count", async () => {
    boundary.reviews.mockResolvedValue(Array.from({ length: 50 }, (_, index) => ({ id: `r${index}`, comment: "説明が丁寧", originalText: null })));
    boundary.count.mockResolvedValue(75);
    boundary.provider.mockResolvedValue(completion(Array.from({ length: 50 }, (_, index) => ({ ...analyses[0], reviewId: `r${index}` }))));
    render(<ReviewAnalyticsClient />);
    await screen.findByText("校舎A / Google口コミ 75件");
    expect(screen.getByText("対象: 最新50件（上限50件） / 本文あり 50件 / 本文なし 0件")).toBeDefined();
    expect(screen.getByText("口コミ 50件 / 抽出意見 50件")).toBeDefined();
    expect(screen.getByText("50件 / 100%")).toBeDefined();
    expect(screen.getAllByRole("link", { name: "元の口コミを確認" })).toHaveLength(50);
  });

  it("keeps the new school's results when an older real API request finishes later", async () => {
    boundary.access.mockResolvedValue({ ...identity, access: { ...identity.access, role: "admin" } });
    let finishOld!: (response: Response) => void;
    const oldResponse = new Promise<Response>(resolve => { finishOld = resolve; });
    boundary.provider.mockReturnValueOnce(oldResponse);
    const view = render(<ReviewAnalyticsClient />);
    await waitFor(() => expect(boundary.provider).toHaveBeenCalledTimes(1));
    boundary.params = new URLSearchParams("schoolId=s2");
    boundary.schools.mockResolvedValue([{ id: "s2", name: "校舎B" }]);
    boundary.reviews.mockResolvedValue([]);
    boundary.count.mockResolvedValue(0);
    view.rerender(<ReviewAnalyticsClient />);
    await screen.findByText("校舎B / Google口コミ 0件");
    expect(boundary.reviews.mock.calls[1][0].where).toEqual({ schoolId: { in: ["s2"] }, source: "GOOGLE", status: { not: "ARCHIVED" } });
    await act(async () => { finishOld(completion()); });
    await waitFor(() => expect(statuses).toEqual([200, 200]));
    expect(screen.getByText("校舎B / Google口コミ 0件")).toBeDefined();
    expect(screen.queryByText("説明が丁寧")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
