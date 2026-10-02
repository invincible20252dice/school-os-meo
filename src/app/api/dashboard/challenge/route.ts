import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { prisma } from "@/lib/prisma";
import { ChallengeError, count, object, readDocument, startChallenge, updateChallenge, weeklyActions } from "@/lib/challenge";
import { loadChallengeData } from "@/lib/challenge-data";
import { reconcileActionHistory, updateNextAction } from "@/lib/challenge-next-actions";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
async function scope(request: Request) {
  const url = new URL(request.url);
  const { access, isAuthenticated } = await resolveRequestAccess(request, url);
  if (!isAuthenticated) throw new ChallengeError("ログイン後に集客チャレンジを確認してください。", 401);
  if (!isApprovedAccess(access)) throw new ChallengeError("アカウントの承認が必要です。", 403);
  const schoolId = url.searchParams.get("schoolId")?.trim();
  if (!schoolId || schoolId === "all") throw new ChallengeError("対象の校舎を選択してください。");
  if (!canAccessSchool(access, schoolId)) throw new ChallengeError("この校舎へのアクセス権限がありません。", 403);
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, phoneNumber: true, addressLine: true, websiteUrl: true } });
  if (!school) throw new ChallengeError("校舎が見つかりません。", 404);
  return { school, actorId: access.userId };
}
function failure(error: unknown) {
  if (error instanceof ChallengeError) return NextResponse.json({ success: false, error: error.message }, { status: error.status, headers });
  const code = error && typeof error === "object" && "code" in error ? error.code : "UNKNOWN";
  console.error("[Challenge API]", { code });
  if (code === "P2002") return NextResponse.json({ success: false, error: "すでに開始されています。再取得してください。" }, { status: 409, headers });
  return NextResponse.json({ success: false, error: "進捗を取得・保存できませんでした。再取得してください。" }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    const { school } = await scope(request);
    const row = await prisma.schoolChallenge.findUnique({ where: { schoolId: school.id } });
    const document = row ? readDocument(row.document) : null;
    const data = await loadChallengeData(school.id, document?.startedAt ?? null);
    return NextResponse.json({ success: true, school, document, version: row?.version ?? 0, ...data,
      actions: document ? weeklyActions(document, data.snapshot) : [] }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { school, actorId } = await scope(request);
    let body;
    try { body = object(await request.json()); } catch { throw new ChallengeError("入力形式が正しくありません。"); }
    const row = await prisma.schoolChallenge.findUnique({ where: { schoolId: school.id } });
    if (body.action === "start") {
      if (row) throw new ChallengeError("すでに開始されています。再取得してください。", 409);
      const { snapshot } = await loadChallengeData(school.id, null);
      const document = startChallenge(body.additionalTarget, snapshot);
      await prisma.schoolChallenge.create({ data: { schoolId: school.id, document: document as unknown as Prisma.InputJsonValue } });
    } else {
      if (!row) throw new ChallengeError("チャレンジを開始してください。", 409);
      const version = count(body.version);
      if (row.version !== version) throw new ChallengeError("別の更新が保存されています。再取得してから記録してください。", 409);
      const current = readDocument(row.document);
      const { snapshot } = await loadChallengeData(school.id, current.startedAt);
      const document = body.action === "next-action" || body.action === "adopt-request-target"
        ? updateNextAction(current, body, snapshot, actorId) : reconcileActionHistory(updateChallenge(current, body, snapshot, actorId), snapshot, actorId);
      const result = await prisma.schoolChallenge.updateMany({ where: { schoolId: school.id, version }, data: { version: { increment: 1 }, document: document as unknown as Prisma.InputJsonValue } });
      if (result.count !== 1) throw new ChallengeError("同時更新を検出しました。再取得してください。", 409);
    }
    return NextResponse.json({ success: true }, { headers });
  } catch (error) { return failure(error); }
}
