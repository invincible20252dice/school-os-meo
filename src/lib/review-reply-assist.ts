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
