import { canAccessSchool } from "@/lib/auth-access";
import { isApprovedAccess } from "@/lib/access-control";
import { resolveRequestAccess } from "@/lib/supabase-access";
import { RequestAuthenticationError } from "@/lib/request-authentication-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildFallbackGbpReply } from "@/lib/gbp-webhook";
import { LineApiError, sendLineReviewNotification } from "@/lib/line";
import {
  triggerReviewTest,
  type TriggerReviewInput,
} from "@/lib/trigger-review-test";

function normalizeToken(value?: string) {
  if (!value || value.includes("*")) {
    return "";
  }

  return value.trim();
}

function getErrorMessage(details: unknown, fallback: string) {
  if (
    details &&
    typeof details === "object" &&
    "message" in details &&
    typeof details.message === "string"
  ) {
    return details.message;
  }

  return fallback;
}

function lineErrorResponse(error: LineApiError) {
  const message = getErrorMessage(error.details, "LINE送信エラー");

  console.error(
    "LINE test notification failed:",
    JSON.stringify(
      {
        status: error.status,
        error: message,
        details: error.details,
      },
      null,
      2,
    ),
  );

  return NextResponse.json(
    {
      ok: false,
      success: false,
      saved: false,
      notified: false,
      error: message,
      message: `LINE送信エラー: ${message}`,
      details: error.details,
      lineStatus: error.status,
    },
    { status: error.status },
  );
}

async function runLocalFallback(body: TriggerReviewInput) {
  const schoolName = body.schoolName || "青葉ゼミナール 本校";
  const rating = body.rating ?? 5;
  const reviewText =
    body.reviewText ??
    "先生がとても親身で、子供の成績が上がりました！";
  const aiReplyText = await buildFallbackGbpReply({
    schoolName,
    rating,
    reviewText,
  });
  const reviewId = `local_test_review_${Date.now()}`;
  const token =
    normalizeToken(body.lineChannelAccessToken) ||
    normalizeToken(process.env.LINE_CHANNEL_ACCESS_TOKEN);
  const to =
    normalizeToken(body.lineDestinationId) ||
    normalizeToken(process.env.LINE_DEFAULT_TO_ID);

  if (token && to) {
    let lineResult;

    try {
      lineResult = await sendLineReviewNotification({
        to,
        channelAccessToken: token,
        reviewId,
        schoolName,
        rating,
        reviewText,
        aiReplyText,
        googleReviewUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000"}/dashboard/reviews`,
      });
    } catch (error) {
      if (error instanceof LineApiError) {
        return {
          ok: false,
          success: false,
          saved: false,
          notified: false,
          error: getErrorMessage(error.details, "LINE送信エラー"),
          message: `LINE送信エラー: ${getErrorMessage(error.details, "LINE送信エラー")}`,
          details: error.details,
          lineStatus: error.status,
          reviewId,
        };
      }

      throw error;
    }

    return {
      ok: true,
      saved: false,
      notified: true,
      reviewId,
      line: lineResult,
      diagnostics: {
        db: "DB未接続のため口コミ保存はスキップしました。",
        lineApi: `LINE API accepted: ${lineResult.status}`,
        lineRequestId: lineResult.requestId,
        destinationType: lineResult.destinationType,
        destinationPreview: lineResult.destinationPreview,
        deliveryNote:
          lineResult.destinationType === "user"
            ? "送信先がUser IDです。対象ユーザーがこのMessaging APIチャネルのBotを友だち追加済みで、ブロックしていない必要があります。"
            : "送信先がグループ/ルームの場合、Botが対象トークへ参加している必要があります。",
      },
      message:
        "LINE APIはテスト通知を受け付けました。DB未接続のため口コミ保存はスキップしました。届かない場合は友だち追加/ブロック/チャネル一致を確認してください。",
    };
  }

  return {
    ok: true,
    saved: false,
    notified: false,
    reviewId,
    message:
      "DB未接続のため口コミ保存はスキップしました。LINEトークンと送信先IDを設定すると実通知を送れます。",
    preview: {
      schoolName,
      rating,
      reviewText,
      aiReplyText,
    },
  };
}

export async function POST(request: Request) {
  let body: TriggerReviewInput;

  // Keep authentication failures outside the legacy notification fallback.
  try {
    const access = await resolveRequestAccess(request, new URL(request.url), undefined, {
      requireActiveProfile: true,
    });
    if (!access.isAuthenticated) {
      return NextResponse.json({ ok: false, message: "ログインしてください。" }, { status: 401 });
    }
    if (!isApprovedAccess(access.access)) {
      return NextResponse.json({ ok: false, message: "アカウント承認後に通知をテストできます。" }, { status: 403 });
    }
    const input = await request.json().catch(() => null);
    const schoolId = typeof input?.schoolId === "string" ? input.schoolId.trim() : "";
    if (!schoolId || schoolId === "all") {
      return NextResponse.json({ ok: false, message: "通知をテストする校舎を選択してください。" }, { status: 400 });
    }
    if (!canAccessSchool(access.access, schoolId)) {
      return NextResponse.json({ ok: false, message: "この校舎の通知はテストできません。" }, { status: 403 });
    }
    body = { ...input, schoolId };
  } catch (error) {
    const status = error instanceof RequestAuthenticationError ? 401 : 500;
    if (status === 500) console.error("Notification test access check failed.");
    return NextResponse.json({ ok: false, message: status === 401 ? "ログインしてください。" : "通知の実行権限を確認できませんでした。" }, { status });
  }

  try {
    const result = await triggerReviewTest({
      input: body,
      prisma,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    if (error instanceof LineApiError) {
      return lineErrorResponse(error);
    }

    console.error(error);
    const fallback = await runLocalFallback(body);
    const fallbackStatus =
      "lineStatus" in fallback && typeof fallback.lineStatus === "number"
        ? fallback.lineStatus
        : 200;

    if (!fallback.ok && "details" in fallback) {
      console.error(
        "LINE API Error Details:",
        JSON.stringify(fallback.details, null, 2),
      );
    }

    return NextResponse.json(fallback, { status: fallbackStatus });
  }
}
