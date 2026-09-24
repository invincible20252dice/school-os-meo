export function formatDraftText(text: string | null | undefined) {
  return (text ?? "").replace(/\\r\\n|\\n|\r\n/g, "\n");
}

export function buildGoogleReviewManagementUrl(
  locationId: string | null | undefined,
) {
  const match = /^(?:(?:accounts\/\d+\/)?locations\/)?(\d+)$/.exec(
    locationId?.trim() ?? "",
  );

  // GBP location IDs identify the owner management page, not a Maps Place ID or CID.
  return match ? `https://business.google.com/n/${match[1]}/reviews` : null;
}

type CopyReviewReplyDependencies = {
  writeText: (text: string) => Promise<void>;
  writeTextFallback?: (text: string) => void;
};

export async function copyReviewReply(
  replyText: string,
  dependencies: CopyReviewReplyDependencies,
) {
  const normalizedReply = formatDraftText(replyText).trim();

  if (!normalizedReply) {
    throw new Error("REPLY_REQUIRED");
  }

  try {
    await dependencies.writeText(normalizedReply);
  } catch (clipboardError) {
    try {
      dependencies.writeTextFallback?.(normalizedReply);

      if (!dependencies.writeTextFallback) {
        throw clipboardError;
      }
    } catch (fallbackError) {
      throw fallbackError;
    }
  }

  return normalizedReply;
}

export async function submitDirectReviewReply(
  input: { reviewId: string; schoolId: string; replyText: string; headers: Record<string, string> },
  fetchImpl: typeof fetch = fetch,
) {
  const replyText = formatDraftText(input.replyText).trim();
  if (!replyText) throw new Error("返信文を入力してください。");
  const response = await fetchImpl("/api/dashboard/reviews/reply", {
    method: "POST",
    headers: { ...input.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ reviewId: input.reviewId, schoolId: input.schoolId, replyText }),
  });
  const body = await response.json().catch(() => null) as { success?: boolean; googlePosted?: boolean; message?: string } | null;
  if (!response.ok || body?.success !== true || body.googlePosted !== true) {
    throw new Error(body?.message || "Googleへの返信送信を確認できませんでした。");
  }
  return body.message || "Googleへ返信を送信しました。";
}
