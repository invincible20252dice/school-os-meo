import { NextResponse } from "next/server";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { prisma } from "@/lib/prisma";
import { ChallengeError } from "@/lib/challenge";
import { generateGuideDraft, guideDraftInput } from "@/lib/action-guide-draft";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const { access, isAuthenticated } = await resolveRequestAccess(request, url);
    if (!isAuthenticated) throw new ChallengeError("ログインしてください。", 401);
    if (!isApprovedAccess(access)) throw new ChallengeError("アカウントの承認が必要です。", 403);
    const schoolId = url.searchParams.get("schoolId")?.trim();
    if (!schoolId || schoolId === "all") throw new ChallengeError("対象校舎を選択してください。");
    if (!canAccessSchool(access, schoolId)) throw new ChallengeError("この校舎への権限がありません。", 403);
    let body: unknown;
    try { body = await request.json(); } catch { throw new ChallengeError("入力形式が正しくありません。"); }
    const input = guideDraftInput(body);
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, addressLine: true, phoneNumber: true, websiteUrl: true } });
    if (!school) throw new ChallengeError("校舎が見つかりません。", 404);
    const draft = await generateGuideDraft({ ...input, school });
    return NextResponse.json({ success: true, draft, published: false }, { headers });
  } catch (error) {
    if (error instanceof ChallengeError) return NextResponse.json({ success: false, error: error.message }, { status: error.status, headers });
    console.error("[Guide draft]", { type: error instanceof Error ? error.name : "Unknown" });
    return NextResponse.json({ success: false, error: "文章生成に失敗しました。再試行してください。" }, { status: 503, headers });
  }
}
