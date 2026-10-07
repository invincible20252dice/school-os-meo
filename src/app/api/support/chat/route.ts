import { NextResponse } from "next/server";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { isApprovedAccess } from "@/lib/access-control";
import { answerSupportQuestion } from "@/lib/support-faq";

export async function POST(request: Request) {
  try {
    const access = await resolveRequestAccess(request, new URL(request.url));
    if (!access.isAuthenticated) return NextResponse.json({ success: false, error: "ログインしてください。" }, { status: 401 });
    if (!isApprovedAccess(access.access)) return NextResponse.json({ success: false, error: "アカウント承認後に利用できます。" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "質問を確認してください。" }, { status: 400 }); }
    if (typeof body?.message !== "string" || !body.message.trim() || body.message.length > 1000) {
      return NextResponse.json({ success: false, error: "質問は1〜1000文字で入力してください。" }, { status: 400 });
    }
    return NextResponse.json({ success: true, mode: "FAQ", reply: answerSupportQuestion(body.message) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ success: false, error: "ヘルプを利用できません。ログイン状態を確認して再試行してください。" }, { status: 503 });
  }
}
