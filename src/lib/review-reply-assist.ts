export const GBP_REVIEWS_MANAGEMENT_URL = "https://business.google.com/locations";

type OpenedWindow = {
  close?: () => void;
  opener?: unknown;
};

type CopyReviewReplyDependencies = {
  writeText: (text: string) => Promise<void>;
  openWindow: (
    url: string,
    target: string,
  ) => OpenedWindow | null;
};

export async function copyReviewReplyAndOpenGbp(
  replyText: string,
  dependencies: CopyReviewReplyDependencies,
) {
  const normalizedReply = replyText.trim();

  if (!normalizedReply) {
    throw new Error("REPLY_REQUIRED");
  }

  const openedWindow = dependencies.openWindow(
    GBP_REVIEWS_MANAGEMENT_URL,
    "_blank",
  );

  if (openedWindow) {
    openedWindow.opener = null;
  }

  try {
    await dependencies.writeText(normalizedReply);
  } catch (error) {
    openedWindow?.close?.();
    throw error;
  }

  if (!openedWindow) {
    throw new Error("POPUP_BLOCKED");
  }

  return {
    replyText: normalizedReply,
    targetUrl: GBP_REVIEWS_MANAGEMENT_URL,
  };
}
