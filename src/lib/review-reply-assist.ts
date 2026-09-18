export const GBP_REVIEWS_MANAGEMENT_URL = "https://business.google.com/locations";

type CopyReviewReplyDependencies = {
  writeText: (text: string) => Promise<void>;
  writeTextFallback?: (text: string) => void;
};

export async function copyReviewReply(
  replyText: string,
  dependencies: CopyReviewReplyDependencies,
) {
  const normalizedReply = replyText.trim();

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
