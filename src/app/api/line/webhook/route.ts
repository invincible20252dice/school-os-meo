import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import {
  handleLineWebhookEvents,
  type LineWebhookEvent,
} from "@/lib/line-webhook";
import { prisma } from "@/lib/prisma";

type LineWebhookBody = {
  events?: LineWebhookEvent[];
};

function verifyLineSignature({
  body,
  channelSecret,
  signature,
}: {
  body: string;
  channelSecret: string;
  signature: string;
}) {
  const expected = createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

function isAuthorized(request: Request, body: string) {
  const secret = process.env.LINE_WEBHOOK_SECRET?.trim();
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const lineSignature = request.headers.get("x-line-signature")?.trim();

  if (channelSecret) {
    return lineSignature
      ? verifyLineSignature({
          body,
          channelSecret,
          signature: lineSignature,
        })
      : false;
  }

  if (!secret) {
    return true;
  }

  return request.headers.get("x-line-webhook-secret") === secret;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    if (!isAuthorized(request, rawBody)) {
      console.error("[LINE Webhook] Unauthorized request.");
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (rawBody ? JSON.parse(rawBody) : {}) as LineWebhookBody;
    const events = Array.isArray(body.events) ? body.events : [];
    console.info("[LINE Webhook] Received events:", events.length);
    const summary = await handleLineWebhookEvents({ events, prisma });

    return NextResponse.json(summary);
  } catch (error) {
    console.error("[LINE Webhook Handler Error]:", error);
    return NextResponse.json({ success: true, handled: false }, { status: 200 });
  }
}
