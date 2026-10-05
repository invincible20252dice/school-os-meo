import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { GOOGLE_BUSINESS_SCOPE } from "./google-gbp-oauth";

export type KeywordState = "AVAILABLE" | "EMPTY" | "DISCONNECTED" | "API_ERROR" | "DB_ERROR";
export type KeywordRow = { query: string; impressions: number | null; threshold: number | null };
export type KeywordDiagnostic = {
  schoolId: string; locationId: string | null; month: string; requiredScope: string;
  grantedScope: string | null; stage: string; httpStatus: number | null;
  googleError?: { code?: number; status?: string; message?: string };
  pages: number; dbCode?: string;
};
export type KeywordResult = { status: KeywordState; rows: KeywordRow[]; diagnostic: KeywordDiagnostic; fetchedAt: string | null };
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function previousKeywordMonth(now = new Date()) {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}
export function keywordUrl(location: string, month: string, pageToken = "") {
  const match = /^(?:locations\/)?(\d+)$/.exec(location);
  if (!match || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid location/month");
  const [year, m] = month.split("-").map(Number);
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${match[1]}/searchkeywords/impressions/monthly`);
  for (const side of ["startMonth", "endMonth"]) {
    url.searchParams.set(`monthlyRange.${side}.year`, String(year));
    url.searchParams.set(`monthlyRange.${side}.month`, String(m));
  }
  url.searchParams.set("pageSize", "100");
  if (pageToken) url.searchParams.set("pageToken", pageToken);
  return url;
}
export function parseKeywordPage(value: unknown) {
  const body = record(value);
  if (!value || typeof value !== "object" || Array.isArray(value) || body.error) throw new Error("Invalid response");
  const items = body.searchKeywordsCounts ?? [];
  if (!Array.isArray(items) || (body.nextPageToken !== undefined && typeof body.nextPageToken !== "string")) throw new Error("Invalid page");
  const number = (v: unknown) => {
    if (typeof v !== "string" || !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))) throw new Error("Invalid count");
    return Number(v);
  };
  const rows = items.map(item => {
    const row = record(item), insights = record(row.insightsValue);
    if (typeof row.searchKeyword !== "string" || !row.searchKeyword.trim() || (insights.value === undefined) === (insights.threshold === undefined)) throw new Error("Invalid keyword");
    return { query: row.searchKeyword, impressions: insights.value === undefined ? null : number(insights.value), threshold: insights.threshold === undefined ? null : number(insights.threshold) };
  });
  return { rows, next: String(body.nextPageToken ?? "") };
}
export async function fetchKeywordMonth(diagnostic: KeywordDiagnostic, refreshToken: string, fetchImpl: typeof fetch = fetch): Promise<KeywordResult> {
  const d = { ...diagnostic };
  const request: typeof fetch = (url, init) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store" });
  async function json(response: Response) {
    d.httpStatus = response.status;
    const data = await response.json();
    if (!response.ok) {
      const e = record(record(data).error);
      d.googleError = { code: response.status, status: typeof e.status === "string" ? e.status : "OAUTH_ERROR", message: typeof e.message === "string" ? e.message : String(record(data).error_description ?? "Google request rejected") };
      throw new Error("Google rejected request");
    }
    return data;
  }
  try {
    d.stage = "CONFIG";
    const url = keywordUrl(d.locationId!, d.month);
    const clientId = process.env.GOOGLE_CLIENT_ID, secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !secret) throw new Error("Missing OAuth configuration");
    d.stage = "OAUTH";
    const token = record(await json(await request("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, refresh_token: refreshToken, grant_type: "refresh_token" }) })));
    if (typeof token.access_token !== "string" || !token.access_token) throw new Error("Missing access token");
    d.grantedScope = typeof token.scope === "string" ? token.scope : null;
    if (d.grantedScope !== null && !d.grantedScope.split(" ").includes(GOOGLE_BUSINESS_SCOPE)) { d.stage = "SCOPE"; throw new Error("Missing business scope"); }
    const rows: KeywordRow[] = [], seen = new Set<string>(), tokens = new Set<string>();
    let next = "";
    do {
      d.stage = "GOOGLE_API";
      d.httpStatus = null;
      if (next) url.searchParams.set("pageToken", next);
      const response = await request(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
      const body = await json(response);
      d.stage = "TRANSFORM";
      const page = parseKeywordPage(body);
      for (const row of page.rows) { if (seen.has(row.query)) throw new Error("Duplicate keyword"); seen.add(row.query); rows.push(row); }
      d.pages++;
      next = page.next;
      if (next && (tokens.has(next) || d.pages >= 100)) throw new Error("Invalid pagination");
      tokens.add(next);
    } while (next);
    d.stage = "FETCHED";
    return { status: rows.length ? "AVAILABLE" : "EMPTY", rows, diagnostic: d, fetchedAt: new Date().toISOString() };
  } catch {
    return { status: "API_ERROR", rows: [], diagnostic: d, fetchedAt: null };
  }
}
export async function loadSearchKeywords(schoolId: string, month = previousKeywordMonth(), now = new Date()): Promise<KeywordResult> {
  const diagnostic: KeywordDiagnostic = { schoolId, month, locationId: null, requiredScope: GOOGLE_BUSINESS_SCOPE, grantedScope: null, stage: "SETTINGS", httpStatus: null, pages: 0 };
  try {
    const setting = await prisma.schoolSetting.findUnique({ where: { schoolId }, select: { googleRefreshToken: true, selectedGbpLocationId: true } });
    const account = await prisma.googleAccount.findUnique({ where: { schoolId }, select: { refreshToken: true, locationId: true } });
    // Choose a complete credential pair, never mix a token with another location.
    const pair = setting?.googleRefreshToken && setting.selectedGbpLocationId ? { token: setting.googleRefreshToken, location: setting.selectedGbpLocationId }
      : account?.refreshToken && account.locationId ? { token: account.refreshToken, location: account.locationId } : null;
    if (!pair) return { status: "DISCONNECTED", rows: [], diagnostic, fetchedAt: null };
    diagnostic.locationId = pair.location.replace(/^locations\//, "");
    diagnostic.stage = "DB_READ";
    const where = { schoolId_locationId_month: { schoolId, locationId: diagnostic.locationId, month } };
    const saved = await prisma.googleSearchKeywordMonth.findUnique({ where });
    if (saved && saved.checkedAt.getTime() > now.getTime() - 3600000) return { status: saved.status as KeywordState, rows: ["AVAILABLE", "EMPTY"].includes(saved.status) ? saved.rows as unknown as KeywordRow[] : [], diagnostic: saved.diagnostic as unknown as KeywordDiagnostic, fetchedAt: saved.fetchedAt?.toISOString() ?? null };
    const result = await fetchKeywordMonth(diagnostic, pair.token);
    Object.assign(diagnostic, result.diagnostic, { stage: "DB_SAVE" });
    const success = result.status === "AVAILABLE" || result.status === "EMPTY";
    const data = { status: result.status, diagnostic: result.diagnostic as unknown as Prisma.InputJsonValue, checkedAt: now,
      ...(success ? { rows: result.rows as unknown as Prisma.InputJsonValue, fetchedAt: now } : {}) };
    await prisma.googleSearchKeywordMonth.upsert({ where, create: { ...where.schoolId_locationId_month, ...data }, update: data });
    console.info("[Search keywords]", { ...result.diagnostic, status: result.status, rowCount: result.rows.length, saved: true });
    return result;
  } catch (error) {
    diagnostic.dbCode = String(record(error).code ?? "UNKNOWN");
    console.error("[Search keywords]", { ...diagnostic, status: "DB_ERROR" });
    return { status: "DB_ERROR", rows: [], diagnostic, fetchedAt: null };
  }
}
