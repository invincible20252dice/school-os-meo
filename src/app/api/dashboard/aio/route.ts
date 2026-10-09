import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import { aioPilot } from "@/lib/aio-pilot";
import { AioRequestError, aioMessages, loadAioMeasurements, loadAioMeasurementDetail, runAioMeasurement } from "@/lib/aio-measurement";

export const maxDuration = 90;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(request: Request) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const url = new URL(request.url);
    const access = await resolveRequestAccess(request, url, undefined, { requireActiveProfile: true });
    if (!access.isAuthenticated) return json({ success: false, error: "ログインしてください。" }, 401);
    if (!isApprovedAccess(access.access)) return json({ success: false, error: "承認が必要です。" }, 403);
    const schoolId = url.searchParams.get("schoolId");
    if (!schoolId || schoolId === "all") return json({ success: false, error: "校舎を選択してください。" }, 400);
    if (!canAccessSchool(access.access, schoolId)) return json({ success: false, error: "この校舎の操作権限がありません。" }, 403);
    const canMeasure = access.access.role === "admin" && schoolId === aioPilot.schoolId;
    if (request.method === "POST" && !canMeasure) return json({ success: false, error: "指定校舎の管理者のみ計測できます。" }, 403);
    if (!process.env.DATABASE_URL?.trim()) throw new AioRequestError("DB_NOT_CONFIGURED", 503);
    if (request.method === "GET") {
      const id = url.searchParams.get("measurementId");
      if (id !== null) return json({ success: true, measurement: await loadAioMeasurementDetail(prisma, schoolId, id) });
      return json({ success: true, ...await loadAioMeasurements(prisma, schoolId), canMeasure, pilotKeywordId: aioPilot.keywordId });
    }
    let body;
    try { body = await request.json(); } catch { throw new AioRequestError("INVALID_REQUEST", 400); }
    if (!body || typeof body.keywordId !== "string" || typeof body.requestId !== "string" || Object.keys(body).some(key => !["keywordId", "requestId"].includes(key))) throw new AioRequestError("INVALID_REQUEST", 400);
    // DB validates active keyword ownership. Transaction deduplication protects
    // different tabs while distinct later measurements receive their own history.
    return json({ success: true, measurement: await runAioMeasurement(prisma, schoolId, body.keywordId, body.requestId) });
  } catch (error) {
    if (error instanceof AioRequestError) return json({ success: false, code: error.code, error: aioMessages[error.code] }, error.status);
    return json({ success: false, code: "STORAGE_FAILED", error: "計測データを取得・保存できませんでした。DB接続と追加テーブルの適用状況を確認してください。" }, 503);
  }
}
export const GET = handle;
export const POST = handle;
