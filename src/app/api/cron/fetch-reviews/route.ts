import { NextResponse } from "next/server";
import { fetchGbpReviews, processGbpReviews } from "@/lib/gbp-webhook";
import { prisma } from "@/lib/prisma";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return true;
  }

  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const reviews = await fetchGbpReviews();
    const summary = await processGbpReviews({ reviews, prisma });

    return NextResponse.json({
      ...summary,
      message: "GBP口コミの取得とAI返信案生成が完了しました。",
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "GBP口コミの取得に失敗しました。" },
      { status: 500 },
    );
  }
}
