type FetchLike = typeof fetch;

export type LineReviewNotification = {
  to: string;
  channelAccessToken?: string;
  reviewId: string;
  schoolName: string;
  rating: number;
  reviewText: string;
  aiReplyText: string;
  googleReviewUrl?: string;
};

export type LineDestinationType = "user" | "group" | "room" | "unknown";

export type LinePushResult = {
  status: number;
  requestId: string | null;
  destinationType: LineDestinationType;
  destinationPreview: string;
};

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

export class LineApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, details: unknown) {
    super(`LINE push message failed: ${status}`);
    this.name = "LineApiError";
    this.status = status;
    this.details = details;
  }
}

export function classifyLineDestination(destinationId: string): LineDestinationType {
  if (destinationId.startsWith("U")) {
    return "user";
  }

  if (destinationId.startsWith("C")) {
    return "group";
  }

  if (destinationId.startsWith("R")) {
    return "room";
  }

  return "unknown";
}

export function maskLineDestination(destinationId: string) {
  if (destinationId.length <= 10) {
    return destinationId;
  }

  return `${destinationId.slice(0, 6)}...${destinationId.slice(-4)}`;
}

async function parseLineErrorResponse(response: Response) {
  const text = await response.text().catch(() => "");

  if (!text) {
    return { message: `LINE API returned ${response.status}` };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export function buildStarRating(rating: number) {
  const normalized = Math.min(5, Math.max(0, Math.round(rating)));
  return `${"★".repeat(normalized)}${"☆".repeat(5 - normalized)}`;
}

function getAppBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }

  return "http://127.0.0.1:3000";
}

function buildReplyUrl(reviewId: string) {
  return `${getAppBaseUrl()}/api/gbp/reply?reviewId=${encodeURIComponent(reviewId)}`;
}

function buildTextBox(text: string, size = "sm") {
  return {
    type: "text",
    text,
    size,
    wrap: true,
    color: "#17202A",
  };
}

export function buildLineReviewMessage(
  notification: Omit<LineReviewNotification, "to">,
): LineFlexMessage {
  const stars = buildStarRating(notification.rating);

  return {
    type: "flex",
    altText: `新着口コミ: ${notification.schoolName} ${stars}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "📩 新着口コミを受信しました！",
            weight: "bold",
            size: "lg",
            color: "#147D68",
          },
          buildTextBox(notification.schoolName, "md"),
          {
            type: "text",
            text: `評価: ${stars} (${notification.rating.toFixed(1)})`,
            size: "lg",
            color: "#F26D5B",
          },
          buildTextBox(`口コミ: ${notification.reviewText}`),
          buildTextBox(`AI返信案: ${notification.aiReplyText}`),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#27B58C",
            action: {
              type: "uri",
              label: "返信を確認する",
              uri: buildReplyUrl(notification.reviewId),
            },
          },
          ...(notification.googleReviewUrl
            ? [
                {
                  type: "button",
                  style: "secondary",
                  action: {
                    type: "uri",
                    label: "Google口コミを開く",
                    uri: notification.googleReviewUrl,
                  },
                },
              ]
            : []),
        ],
      },
    },
  };
}

export async function sendLineReviewNotification(
  notification: LineReviewNotification,
  fetchImpl: FetchLike = fetch,
): Promise<LinePushResult> {
  const token = notification.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  const response = await fetchImpl("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: notification.to,
      messages: [
        buildLineReviewMessage({
          reviewId: notification.reviewId,
          schoolName: notification.schoolName,
          rating: notification.rating,
          reviewText: notification.reviewText,
          aiReplyText: notification.aiReplyText,
          googleReviewUrl: notification.googleReviewUrl,
        }),
      ],
    }),
  });

  if (!response.ok) {
    const details = await parseLineErrorResponse(response);
    console.error("LINE API Error Details:", JSON.stringify(details, null, 2));
    throw new LineApiError(response.status, details);
  }

  const result = {
    status: response.status,
    requestId: response.headers.get("x-line-request-id"),
    destinationType: classifyLineDestination(notification.to),
    destinationPreview: maskLineDestination(notification.to),
  };

  console.info("LINE API Push Accepted:", JSON.stringify(result, null, 2));

  return result;
}
