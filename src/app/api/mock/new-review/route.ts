import { NextResponse } from "next/server";
import {
  buildManualReviewTest,
  type ManualReviewTestInput,
} from "@/lib/manual-review-test";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ManualReviewTestInput;
  const result = await buildManualReviewTest(body);

  return NextResponse.json(result);
}
