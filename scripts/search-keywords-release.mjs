import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

// Explicit production release step; never invoked by ordinary builds.
if (process.env.VERCEL_ENV !== "production") throw new Error("Production release only");
const schoolId = process.env.SEARCH_KEYWORD_DIAGNOSTIC_SCHOOL;
if (!schoolId) throw new Error("An explicit diagnostic school is required");
const db = new PrismaClient();
try {
  const columns = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'SearchQueryLog' ORDER BY ordinal_position`;
  console.info("[Search audit before migration]", { schoolId, columns });
  const sql = readFileSync("prisma/migrations/20261005070000_search_keyword_sync/migration.sql", "utf8");
  await db.$transaction(sql.split(";").filter(s => s.trim()).map(s => db.$executeRawUnsafe(s)));
  await db.searchQueryLog.findFirst({ where: { schoolId }, select: { id: true, updatedAt: true, intent: true } });
  console.info("[Search audit migration] Additive columns/table applied; no rows deleted or reset");
  await build({ entryPoints: ["src/lib/google-search-keywords.ts"], bundle: true, platform: "node", format: "esm", packages: "external", outfile: "work/search-keywords-runtime.mjs" });
  const { loadSearchKeywords } = await import("../work/search-keywords-runtime.mjs");
  const result = await loadSearchKeywords(schoolId);
  console.info("[Search audit result]", JSON.stringify({ ...result, rows: result.rows.map(r => ({ ...r, query: "[redacted search term]" })) }));
  const s = await db.schoolSetting.findUnique({ where: { schoolId }, select: { googleRefreshToken: true, selectedGbpLocationId: true } });
  const a = await db.googleAccount.findUnique({ where: { schoolId }, select: { refreshToken: true, locationId: true } });
  const pair = s?.googleRefreshToken && s.selectedGbpLocationId ? { token: s.googleRefreshToken, location: s.selectedGbpLocationId } : a?.refreshToken && a.locationId ? { token: a.refreshToken, location: a.locationId } : null;
  if (pair) {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(15000), body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: pair.token, grant_type: "refresh_token" }) });
    const token = await tokenRes.json();
    console.info("[Google connection audit]", { oauthStatus: tokenRes.status, grantedScope: token.scope ?? null });
    if (tokenRes.ok && token.access_token) {
      const location = pair.location.replace(/^locations\//, "");
      const response = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/locations/${location}?readMask=name,title`, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token.access_token}` } });
      const body = await response.json();
      console.info("[Google location audit]", JSON.stringify({ status: response.status, name: body.name, title: body.title, error: body.error }));
    }
  }
} finally { await db.$disconnect(); }
process.exit(0);
