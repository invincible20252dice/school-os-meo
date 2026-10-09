import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import { aioPilot } from "@/lib/aio-pilot";
import { refreshAioPlaces } from "@/lib/aio-places";
import { PlacesError, placesMessages } from "@/lib/aio-places-provider";

export const maxDuration = 120;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" } });
  try {
    const url = new URL(request.url), schoolId = url.searchParams.get("schoolId");
    const access = await resolveRequestAccess(request, url, undefined, { requireActiveProfile: true });
    if (!access.isAuthenticated) return json({ success: false, error: "ログインしてください。" }, 401);
    if (!isApprovedAccess(access.access) || access.access.role !== "admin" || !schoolId || schoolId !== aioPilot.schoolId || !canAccessSchool(access.access, schoolId)) return json({ success: false, error: "指定校舎の管理者のみ取得できます。" }, 403);
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({ success: false, error: "取得元を確認してください。" }, 403);
    let body;
    try { body = await request.json(); } catch { throw new PlacesError("INVALID_REQUEST", 400); }
    if (!body || typeof body.requestId !== "string" || Object.keys(body).length !== 1) throw new PlacesError("INVALID_REQUEST", 400);
    if (!process.env.DATABASE_URL?.trim()) throw new PlacesError("STORAGE_FAILED");
    return json({ success: true, ...await refreshAioPlaces(prisma, schoolId, body.requestId) });
  } catch (error) {
    const code = error instanceof PlacesError ? error.code : "STORAGE_FAILED";
    return json({ success: false, code, error: `競合Googleデータを取得できませんでした。${placesMessages[code]}` }, error instanceof PlacesError ? error.status : 503);
  }
}
