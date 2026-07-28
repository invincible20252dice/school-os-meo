import { NextResponse } from "next/server";
import { analyzeAndStoreAioScores } from "@/lib/aio-cron";
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
    const summary = await analyzeAndStoreAioScores({ prisma });
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "AIOスコア分析に失敗しました。" },
      { status: 500 },
    );
  }
}
