import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncInstagramPosts } from "@/lib/instagram-sync";

export async function POST() {
  try {
    const summary = await syncInstagramPosts({ prisma });

    return NextResponse.json({
      ok: true,
      message: "Instagram実同期を実行しました。",
      summary,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Instagram実同期に失敗しました。",
      },
      { status: 500 },
    );
  }
}
