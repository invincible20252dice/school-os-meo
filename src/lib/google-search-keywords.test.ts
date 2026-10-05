import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "./prisma";
import { GOOGLE_BUSINESS_SCOPE } from "./google-gbp-oauth";
import { fetchKeywordMonth, keywordUrl, loadSearchKeywords, parseKeywordPage, previousKeywordMonth, type KeywordDiagnostic } from "./google-search-keywords";
vi.mock("./prisma", () => ({ prisma: { schoolSetting: { findUnique: vi.fn() }, googleAccount: { findUnique: vi.fn() }, googleSearchKeywordMonth: { findUnique: vi.fn(), upsert: vi.fn() } } }));
const d = (): KeywordDiagnostic => ({ schoolId: "a", locationId: "123", month: "2026-09", requiredScope: GOOGLE_BUSINESS_SCOPE, grantedScope: null, stage: "SETTINGS", httpStatus: null, pages: 0 });
const res = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
const token = () => res({ access_token: "secret", scope: GOOGLE_BUSINESS_SCOPE });
const page = (query = "塾", value = "25") => ({ searchKeywordsCounts: [{ searchKeyword: query, insightsValue: { value } }] });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("GOOGLE_CLIENT_ID", "id"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({ googleRefreshToken: "refresh", selectedGbpLocationId: "locations/123" } as never);
  vi.mocked(prisma.googleAccount.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.googleSearchKeywordMonth.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.googleSearchKeywordMonth.upsert).mockResolvedValue({} as never);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Google monthly search protocol", () => {
  it("uses the previous completed JST month and normalizes IDs", () => {
    expect(previousKeywordMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12");
    expect(previousKeywordMonth(new Date("2026-09-30T15:00:00Z"))).toBe("2026-09");
    expect(previousKeywordMonth()).toMatch(/^\d{4}-\d{2}$/);
    const url = keywordUrl("locations/123", "2026-09", "next");
    expect(url.pathname).toBe("/v1/locations/123/searchkeywords/impressions/monthly");
    expect(url.searchParams.get("monthlyRange.startMonth.month")).toBe("9");
    expect(url.searchParams.get("monthlyRange.endMonth.year")).toBe("2026");
    expect(url.searchParams.get("pageToken")).toBe("next");
  });
  it.each([["manual-1", "2026-09"], ["123", "2026-13"]])("rejects invalid resource/range", (location, month) => expect(() => keywordUrl(location, month)).toThrow());
  it("keeps thresholds distinct from exact zero and empty results", () => {
    expect(parseKeywordPage({})).toEqual({ rows: [], next: "" });
    expect(parseKeywordPage({ searchKeywordsCounts: [{ searchKeyword: "x", insightsValue: { threshold: "15" } }, { searchKeyword: "y", insightsValue: { value: "0" } }] }).rows).toEqual([{ query: "x", impressions: null, threshold: 15 }, { query: "y", impressions: 0, threshold: null }]);
  });
  it.each([null, [], "x", { error: {} }, { searchKeywordsCounts: {} }, { nextPageToken: 1 }, { searchKeywordsCounts: [null] }, { searchKeywordsCounts: [{ searchKeyword: " ", insightsValue: { value: "3" } }] }, { searchKeywordsCounts: [{ searchKeyword: "x", insightsValue: {} }] }, { searchKeywordsCounts: [{ searchKeyword: "x", insightsValue: { value: "1", threshold: "2" } }] }, ...[3, "-1", "1.5", "9007199254740992"].map(value => ({ searchKeywordsCounts: [{ searchKeyword: "x", insightsValue: { value } }] }))])("rejects malformed data without making zeroes", value => expect(() => parseKeywordPage(value)).toThrow());
  it("fetches every page with official parameters and no secrets in diagnostics", async () => {
    const f = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res({ ...page(), nextPageToken: "n" })).mockResolvedValueOnce(res(page("other")));
    const result = await fetchKeywordMonth(d(), "refresh", f);
    expect(result).toMatchObject({ status: "AVAILABLE", diagnostic: { stage: "FETCHED", pages: 2, httpStatus: 200, grantedScope: GOOGLE_BUSINESS_SCOPE } });
    expect(result.rows).toHaveLength(2);
    expect(String(f.mock.calls[2][0])).toContain("pageToken=n");
    expect(JSON.stringify(result)).not.toMatch(/secret|refresh/);
  });
  it("accepts a successful empty response", async () => {
    expect((await fetchKeywordMonth(d(), "r", vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res({})))).status).toBe("EMPTY");
  });
  it.each([403, 429, 500])("preserves Google HTTP %i and error information", async status => {
    const result = await fetchKeywordMonth(d(), "r", vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res({ error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }, status)));
    expect(result).toMatchObject({ status: "API_ERROR", diagnostic: { stage: "GOOGLE_API", httpStatus: status, googleError: { message: "quota" } } });
  });
  it("separates revoked OAuth and missing scope", async () => {
    const revoked = await fetchKeywordMonth(d(), "r", vi.fn().mockResolvedValue(res({ error: "invalid_grant", error_description: "revoked" }, 400)));
    expect(revoked.diagnostic).toMatchObject({ stage: "OAUTH", googleError: { status: "OAUTH_ERROR", message: "revoked" } });
    const missing = await fetchKeywordMonth(d(), "r", vi.fn().mockResolvedValue(res({ access_token: "s", scope: "email" })));
    expect(missing.diagnostic.stage).toBe("SCOPE");
  });
  it("handles missing configuration, token and network failures", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    expect((await fetchKeywordMonth(d(), "r")).diagnostic.stage).toBe("CONFIG");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "s");
    expect((await fetchKeywordMonth(d(), "r", vi.fn().mockResolvedValue(res({})))).diagnostic.stage).toBe("OAUTH");
    expect((await fetchKeywordMonth(d(), "r", vi.fn().mockRejectedValue(new Error("timeout")))).status).toBe("API_ERROR");
  });
  it("does not infer granted scope when Google omits it", async () => {
    const r = await fetchKeywordMonth(d(), "r", vi.fn().mockResolvedValueOnce(res({ access_token: "s" })).mockResolvedValueOnce(res({})));
    expect(r.diagnostic.grantedScope).toBeNull();
  });
  it("rejects repeated keywords, repeated page tokens and malformed JSON", async () => {
    const duplicate = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res({ ...page(), nextPageToken: "n" })).mockResolvedValueOnce(res(page()));
    expect((await fetchKeywordMonth(d(), "r", duplicate)).diagnostic.stage).toBe("TRANSFORM");
    const loop = vi.fn().mockResolvedValueOnce(token()).mockResolvedValue(res({ nextPageToken: "n" }));
    expect((await fetchKeywordMonth(d(), "r", loop)).status).toBe("API_ERROR");
    const invalid = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("not json"));
    expect((await fetchKeywordMonth(d(), "r", invalid)).status).toBe("API_ERROR");
  });
});
describe("monthly persistence and connection isolation", () => {
  it("stores verified counts and month/location scope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res(page())));
    const result = await loadSearchKeywords("a", "2026-09");
    expect(result.status).toBe("AVAILABLE");
    expect(prisma.googleSearchKeywordMonth.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId_locationId_month: { schoolId: "a", locationId: "123", month: "2026-09" } }, update: expect.objectContaining({ rows: result.rows }) }));
  });
  it("does not overwrite last successful rows on API failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res({}, 403)));
    expect((await loadSearchKeywords("a")).status).toBe("API_ERROR");
    expect(vi.mocked(prisma.googleSearchKeywordMonth.upsert).mock.calls[0][0].update).not.toHaveProperty("rows");
  });
  it.each(["AVAILABLE", "EMPTY", "API_ERROR"])("reuses fresh persisted %s without retry storms", async status => {
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    vi.mocked(prisma.googleSearchKeywordMonth.findUnique).mockResolvedValue({ status, rows: [{ query: "old" }], diagnostic: d(), checkedAt: new Date(), fetchedAt: status === "API_ERROR" ? null : new Date() } as never);
    const result = await loadSearchKeywords("a");
    expect(result.status).toBe(status); expect(f).not.toHaveBeenCalled();
    if (status === "API_ERROR") expect(result.rows).toEqual([]);
  });
  it("uses a complete legacy credential pair, never another school's record", async () => {
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.googleAccount.findUnique).mockResolvedValue({ refreshToken: "r", locationId: "456" } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res({})));
    expect((await loadSearchKeywords("a")).diagnostic.locationId).toBe("456");
    expect(prisma.googleAccount.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "a" } }));
  });
  it.each([null, { googleRefreshToken: "r" }, { selectedGbpLocationId: "123" }])("reports disconnected incomplete settings %j", async setting => {
    vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(setting as never);
    expect((await loadSearchKeywords("a")).status).toBe("DISCONNECTED");
    expect(prisma.googleSearchKeywordMonth.upsert).not.toHaveBeenCalled();
  });
  it.each(["SETTINGS", "DB_READ", "DB_SAVE"])("reports storage failure at %s, preserving data", async stage => {
    const target = stage === "SETTINGS" ? prisma.schoolSetting.findUnique : stage === "DB_READ" ? prisma.googleSearchKeywordMonth.findUnique : prisma.googleSearchKeywordMonth.upsert;
    vi.mocked(target).mockRejectedValue({ code: "P2022" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(res({})));
    expect((await loadSearchKeywords("a")).diagnostic).toMatchObject({ stage, dbCode: "P2022" });
  });
  it("sanitizes unexpected database errors", async () => {
    vi.mocked(prisma.schoolSetting.findUnique).mockRejectedValue(new Error("secret"));
    const r = await loadSearchKeywords("a"); expect(r.diagnostic.dbCode).toBe("UNKNOWN"); expect(JSON.stringify(r)).not.toContain("secret");
  });
});
