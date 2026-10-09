import { NextResponse } from "next/server";
import { analyzeAndStoreAioScores } from "@/lib/aio-cron";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await analyzeAndStoreAioScores(), { status: 503 });
}
