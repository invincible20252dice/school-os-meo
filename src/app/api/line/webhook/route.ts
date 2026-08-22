import { NextResponse } from "next/server";
import {
  handleLineWebhookEvents,
  type LineWebhookEvent,
} from "@/lib/line-webhook";
import { prisma } from "@/lib/prisma";

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

function isAuthorized(request: Request) {
  const secret = process.env.LINE_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return true;
  }

  return request.headers.get("x-line-webhook-secret") === secret;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as LineWebhookBody;
    const events = Array.isArray(body.events) ? body.events : [];
    const summary = await handleLineWebhookEvents({ events, prisma });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("LINE webhook handling failed.", error);
    return NextResponse.json(
      { message: "LINE Webhookの処理に失敗しました。" },
      { status: 500 },
    );
  }
}
