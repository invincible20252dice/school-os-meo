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

function buildTextBox(text: string, size = "sm") {
  return {
    type: "text",
    text,
    size,
    wrap: true,
    color: "#17202A",
  };
}

export function buildLineTextMessage(text: string) {
  return {
    type: "text",
    text,
  };
}

function buildLinePostbackData(action: string, reviewId: string) {
  return JSON.stringify({ action, reviewId });
}

export function buildLineCustomReplyConfirmationMessage({
  reviewId,
  userCustomText,
}: {
  reviewId: string;
  userCustomText: string;
}): LineFlexMessage {
  return {
    type: "flex",
    altText: "返信文の投稿確認",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "こちらの文章で投稿してよろしいですか？",
            weight: "bold",
            size: "md",
            color: "#111827",
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            paddingAll: "12px",
            backgroundColor: "#F3F4F6",
            cornerRadius: "8px",
            contents: [
              {
                type: "text",
                text: userCustomText,
                wrap: true,
                size: "sm",
                color: "#374151",
              },
            ],
          },
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
            color: "#059669",
            action: {
              type: "postback",
              label: "この内容で確定して投稿",
              data: buildLinePostbackData("confirm_custom_reply", reviewId),
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "もう一度修正する",
              data: buildLinePostbackData("request_edit_text", reviewId),
            },
          },
        ],
      },
    },
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
            text: `🌟 新着Google口コミ（★${notification.rating} / ${notification.schoolName}）`,
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
          buildTextBox(`【投稿内容】${notification.reviewText}`),
          buildTextBox(`【AI返信ドラフト】${notification.aiReplyText}`),
          buildTextBox("修正して投稿したい場合は、このメッセージに修正したい返信文をそのまま返信してください。", "xs"),
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
              type: "postback",
              label: "この内容でGBPに投稿",
              data: buildLinePostbackData("approve_reply", notification.reviewId),
              displayText: "この内容で返信",
            },
          },
          {
            type: "button",
            style: "secondary",
            action: {
              type: "postback",
              label: "✏️ 返信文を編集",
              data: buildLinePostbackData(
                "request_edit_text",
                notification.reviewId || "mock",
              ),
              displayText: "返信文を編集します",
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

export async function replyLineMessage({
  replyToken,
  channelAccessToken,
  text,
  fetchImpl = fetch,
}: {
  replyToken: string;
  channelAccessToken?: string;
  text: string;
  fetchImpl?: FetchLike;
}) {
  return replyLineTextMessages({
    replyToken,
    channelAccessToken,
    texts: [text],
    fetchImpl,
  });
}

export async function replyLineTextMessages({
  replyToken,
  channelAccessToken,
  texts,
  fetchImpl = fetch,
}: {
  replyToken: string;
  channelAccessToken?: string;
  texts: string[];
  fetchImpl?: FetchLike;
}) {
  const token = (channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN)?.trim();

  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  const response = await fetchImpl("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: texts.map(buildLineTextMessage),
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
  };

  console.info("[LINE Reply Result]:", JSON.stringify(result, null, 2));

  return result;
}

export async function replyLineFlexMessage({
  replyToken,
  channelAccessToken,
  message,
  fetchImpl = fetch,
}: {
  replyToken: string;
  channelAccessToken?: string;
  message: LineFlexMessage;
  fetchImpl?: FetchLike;
}) {
  const token = (channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN)?.trim();

  if (!token) {
    throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
  }

  const response = await fetchImpl("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      replyToken,
      messages: [message],
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
  };

  console.info("[LINE Reply Result]:", JSON.stringify(result, null, 2));

  return result;
}
