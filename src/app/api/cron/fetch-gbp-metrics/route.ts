import { NextResponse } from "next/server";
import { fetchAndStoreGbpMetrics } from "@/lib/gbp-metrics";
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
    const summary = await fetchAndStoreGbpMetrics({ prisma });
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "GBPインサイトの取得に失敗しました。" },
      { status: 500 },
    );
  }
}
