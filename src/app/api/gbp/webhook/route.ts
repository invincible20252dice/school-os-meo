import { NextResponse } from "next/server";
import {
  fetchGbpReviews,
  type IncomingGbpReview,
  processGbpReviews,
} from "@/lib/gbp-webhook";
import { prisma } from "@/lib/prisma";

type GbpWebhookBody = {
  reviews?: IncomingGbpReview[];
};

function isAuthorized(request: Request) {
  const secret = process.env.GBP_WEBHOOK_SECRET;

  if (!secret) {
    return true;
  }

  return request.headers.get("x-gbp-webhook-secret") === secret;
}

async function resolveReviews(request: Request) {
  const body = (await request.json().catch(() => ({}))) as GbpWebhookBody;

  if (Array.isArray(body.reviews)) {
    return body.reviews;
  }

  return fetchGbpReviews();
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const reviews = await resolveReviews(request);
    const summary = await processGbpReviews({
      reviews,
      prisma,
    });

    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "GBP口コミの処理に失敗しました。" },
      { status: 500 },
    );
  }
}
