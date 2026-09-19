export const GOOGLE_REVIEW_MANAGEMENT_URL =
  "https://www.google.com/search?q=i%E3%82%B9%E3%82%AF%E3%83%BC%E3%83%AB%E4%BA%88%E5%82%99%E6%A0%A1+%E6%9C%AC%E6%A0%A1";

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
