// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewsClient from "./reviews-client";
import styles from "./page.module.css";
import { GET as listReviews } from "@/app/api/reviews/route";
import { POST as reply } from "@/app/api/gbp/reply/route";
import { prisma } from "@/lib/prisma";

// Only external boundaries are replaced: session identity, PostgreSQL, and Google HTTP.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("schoolId=school-1") }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "session-token" } } }) } }) }));
vi.mock("@/lib/supabase-access", async () => ({
  ...await vi.importActual<typeof import("@/lib/supabase-access")>("@/lib/supabase-access"),
  resolveRequestAccess: async () => ({ isAuthenticated: true, access: {
    userId: "manager-1", role: "manager", schoolId: "school-1", schoolIds: ["school-1"],
    status: "active", name: "Manager", email: "manager@example.com", source: "profiles",
  } }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { review: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() } } }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("real component -> API -> OAuth/Google -> persistence -> list workflow", () => {
  it.each([403, 429, 500])("keeps remote publication distinct from local persistence (Google=%s)", async refusal => {
    const stored = {
      id: "review-1", schoolId: "school-1", source: "GOOGLE", status: "PENDING",
      authorName: "投稿者", parentName: null, originalText: "丁寧な指導でした。", comment: null, rating: 5,
      googleReviewId: "accounts/1/locations/100/reviews/real", gbpReviewId: "real",
      aiReplyText: "元の返信案", aiReplyDraft: "元の返信案", replyText: null,
      aiReplyGeneratedAt: null, repliedAt: null, createdAt: new Date("2026-09-01T00:00:00Z"),
      school: { name: "対象校舎", gbpAccountId: "accounts/1", gbpLocationId: "locations/100",
        schoolSetting: { googleAccountId: "accounts/1", googleRefreshToken: "school-token", selectedGbpLocationId: "locations/100" }, googleAccount: null },
    };
    vi.mocked(prisma.review.findMany).mockImplementation(async () => [stored] as never);
    vi.mocked(prisma.review.findUnique).mockImplementation(async () => stored as never);
    vi.mocked(prisma.review.update).mockImplementation(async args => Object.assign(stored, args.data) as never);
    let googleAttempts = 0;
    const edited = "編集済みの返信です。\nありがとうございました。";
    const network = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/")) {
        expect(init?.headers).toMatchObject({ authorization: "Bearer session-token" });
        const request = new Request(`https://example.com${url}`, init);
        return init?.method === "POST" ? reply(request) : listReviews(request);
      }
      if (url === "https://oauth2.googleapis.com/token") {
        expect(Object.fromEntries(init?.body as URLSearchParams)).toMatchObject({ refresh_token: "school-token", grant_type: "refresh_token" });
        return Response.json({ access_token: "fresh-google-token" });
      }
      expect(init?.headers).toMatchObject({ Authorization: "Bearer fresh-google-token" });
      if (url === "https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews?pageSize=50") {
        return Response.json({ reviews: [{ reviewId: "real", name: stored.googleReviewId }] });
      }
      expect(url).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/100/reviews/real/reply");
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(init?.body as string)).toEqual({ comment: edited });
      googleAttempts += 1;
      return googleAttempts === 1 ? Response.json({ error: { message: "provider refused" } }, { status: refusal }) : Response.json({ comment: edited });
    });
    vi.stubGlobal("fetch", network);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    const editor = () => screen.getByRole("textbox", { name: "AI返信案" }) as HTMLTextAreaElement;
    fireEvent.change(editor(), { target: { value: edited } });
    fireEvent.click(screen.getByRole("button", { name: "Googleに直接返信を送信" }));
    const notice = await screen.findByRole("status");
    expect(editor().value).toBe(edited);
    expect(stored.status).toBe("PENDING");
    expect(stored.replyText).toBeNull();
    expect(stored.repliedAt).toBeNull();
    expect(screen.queryByText("返信済")).toBeNull();
    expect(googleAttempts).toBe(1);
    if (refusal === 500) {
      expect(notice.className).toBe(styles.errorMessage);
      expect(prisma.review.update).not.toHaveBeenCalled();
      expect(stored.aiReplyDraft).toBe("元の返信案");
      return;
    }
    expect(notice.className).toBe(styles.warningMessage);
    expect(notice.textContent).toContain("Googleには未反映");
    expect(stored.aiReplyDraft).toBe(edited);
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    await waitFor(() => expect(editor().disabled).toBe(false));
    expect(editor().value).toBe(edited);
    expect(screen.getByText("未返信")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Googleに直接返信を送信" }));
    await screen.findByText("返信済");
    expect(screen.getByRole("status").className).toBe(styles.successMessage);
    expect(stored).toMatchObject({ status: "REPLIED", replyText: edited, repliedAt: expect.any(Date), googleReviewId: "accounts/1/locations/100/reviews/real" });
    expect(googleAttempts).toBe(2);
    expect(prisma.review.update).toHaveBeenCalledTimes(2);
  });
});
