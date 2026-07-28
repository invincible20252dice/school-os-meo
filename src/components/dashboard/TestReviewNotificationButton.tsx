"use client";

import { useState } from "react";
import styles from "./TestReviewNotificationButton.module.css";

type TestReviewNotificationButtonProps = {
  lineChannelAccessToken?: string;
  lineDestinationId?: string;
  compact?: boolean;
};

type TriggerReviewResponse = {
  message?: string;
  error?: string;
  lineStatus?: number;
  details?: unknown;
  line?: {
    status?: number;
    requestId?: string | null;
    destinationType?: string;
    destinationPreview?: string;
  };
  diagnostics?: Record<string, unknown>;
};

function BoltIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" />
    </svg>
  );
}

export default function TestReviewNotificationButton({
  lineChannelAccessToken,
  lineDestinationId,
  compact = false,
}: TestReviewNotificationButtonProps) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );

  async function triggerTest() {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/test/trigger-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineChannelAccessToken,
          lineDestinationId,
        }),
      });
      const text = await response.text();
      let body: TriggerReviewResponse = {};

      try {
        body = text ? (JSON.parse(text) as TriggerReviewResponse) : {};
      } catch {
        const plainText = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(
          `APIがJSONではないレスポンスを返しました。HTTP ${response.status}: ${
            plainText.slice(0, 220) || "レスポンス本文なし"
          }`,
        );
      }

      if (!response.ok) {
        const detailText = body.details
          ? ` / 詳細: ${JSON.stringify(body.details)}`
          : "";
        const statusText = body.lineStatus ? `LINE ${body.lineStatus}: ` : "";

        throw new Error(
          `${statusText}${body.error || body.message || "テスト通知の送信に失敗しました。"}${detailText}`,
        );
      }

      setStatus("success");
      const lineInfo = body.line
        ? ` / LINE status: ${body.line.status ?? "-"} / request id: ${
            body.line.requestId ?? "-"
          } / to: ${body.line.destinationPreview ?? "-"} (${
            body.line.destinationType ?? "-"
          })`
        : "";
      const diagnosticInfo = body.diagnostics
        ? ` / 診断: ${JSON.stringify(body.diagnostics)}`
        : "";

      setMessage(
        `${body.message || "LINEにテスト通知を送信しました！"}${lineInfo}${diagnosticInfo}`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "テスト通知の送信に失敗しました。",
      );
    }
  }

  return (
    <div className={compact ? styles.compactWrap : styles.wrap}>
      <button
        type="button"
        className={compact ? styles.compactButton : styles.button}
        onClick={triggerTest}
        disabled={status === "loading"}
      >
        <BoltIcon />
        {status === "loading"
          ? "テスト通知を送信中..."
          : compact
            ? "テスト通知を送信"
            : "【テスト】ダミー口コミを発生させてLINE通知を送る"}
      </button>
      {message ? (
        <p className={status === "success" ? styles.success : styles.error}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
