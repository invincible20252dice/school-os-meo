import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { canAccessSchool } from "@/lib/auth-access";

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const access = await resolveRequestAccess(request, url);
    if (!access.isAuthenticated) return NextResponse.json({ success: false, error: "ログインしてください。" }, { status: 401 });
    if (!isApprovedAccess(access.access)) return NextResponse.json({ success: false, error: "アカウントの承認が必要です。" }, { status: 403 });
    let body;
    if (request.method === "POST" || request.method === "PATCH") {
      try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "入力内容を確認してください。" }, { status: 400 }); }
    }
    const schoolId = url.searchParams.get("schoolId") || body?.schoolId;
    if (typeof schoolId !== "string") return NextResponse.json({ success: false, error: "校舎を選択してください。" }, { status: 400 });
    if (!schoolId || schoolId === "all") return NextResponse.json({ success: false, error: "校舎を選択してください。" }, { status: 400 });
    if (!canAccessSchool(access.access, schoolId)) return NextResponse.json({ success: false, error: "この校舎の操作権限がありません。" }, { status: 403 });
    if (request.method === "GET") return NextResponse.json({ success: true, districts: await prisma.targetDistrict.findMany({ where: { schoolId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }) });
    const id = url.searchParams.get("id");
    if (request.method !== "POST" && !id) return NextResponse.json({ success: false, error: "校区IDが必要です。" }, { status: 400 });
    if (request.method === "DELETE") {
      const result = await prisma.targetDistrict.deleteMany({ where: { id: id!, schoolId } });
      return NextResponse.json({ success: result.count > 0 }, { status: result.count ? 200 : 404 });
    }
    const { name, focusPoint = "", aiMessage = "" } = body || {};
    if (typeof name !== "string" || !name.trim() || name.length > 100 || typeof focusPoint !== "string" || focusPoint.length > 2000 || typeof aiMessage !== "string" || aiMessage.length > 4000) return NextResponse.json({ success: false, error: "校区名は1〜100文字、打ち出しポイントは2000文字、メッセージは4000文字以内で入力してください。" }, { status: 400 });
    const data = { name: name.trim(), focusPoint: focusPoint.trim(), aiMessage: aiMessage.trim() };
    if (request.method === "POST") return NextResponse.json({ success: true, district: await prisma.targetDistrict.create({ data: { schoolId, ...data } }) }, { status: 201 });
    const result = await prisma.targetDistrict.updateMany({ where: { id: id!, schoolId }, data });
    return NextResponse.json({ success: result.count > 0 }, { status: result.count ? 200 : 404 });
  } catch (error) {
    const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    return NextResponse.json({ success: false, error: duplicate ? "同じ名前の校区が登録されています。" : "校区情報を保存・取得できませんでした。再試行してください。" }, { status: duplicate ? 409 : 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
