import { NextResponse } from "next/server";
import { syncInstagramPosts } from "@/lib/instagram-sync";
import { prisma } from "@/lib/prisma";
import { InstagramSyncUnavailableError } from "@/lib/instagram-sync-readiness";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret?.trim()) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncInstagramPosts({ prisma });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof InstagramSyncUnavailableError) {
      return NextResponse.json({ code: "SYNC_UNAVAILABLE", message: error.message }, { status: 503 });
    }
    console.error("Instagram cron sync failed.");
    return NextResponse.json(
      { message: "Instagram投稿のGBP同期に失敗しました。" },
      { status: 500 },
    );
  }
}
