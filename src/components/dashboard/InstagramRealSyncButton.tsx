"use client";

import { useState } from "react";
import styles from "./InstagramRealSyncButton.module.css";

function BoltIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" />
    </svg>
  );
}

export default function InstagramRealSyncButton({
  schoolId = "",
}: {
  schoolId?: string;
}) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );

  async function runSync() {
    setStatus("loading");
    setMessage("");

    try {
      const params = new URLSearchParams();

      if (schoolId) {
        params.set("schoolId", schoolId);
      }

      const response = await fetch(
        `/api/instagram/sync${params.size ? `?${params.toString()}` : ""}`,
        {
          method: "POST",
        },
      );
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
        summary?: unknown;
      };

      if (!response.ok || !body.ok) {
        throw new Error(body.message || "Instagram実同期に失敗しました。");
      }

      setStatus("success");
      setMessage(`${body.message} ${JSON.stringify(body.summary)}`);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Instagram実同期に失敗しました。",
      );
    }
  }

  return (
    <div className={styles.wrap}>
      <button type="button" onClick={runSync} disabled={status === "loading"}>
        <BoltIcon />
        {status === "loading"
          ? "実同期を実行中..."
          : "実際のInstagramから投稿を取得してGBP連携を実行"}
      </button>
      {message ? (
        <p className={status === "success" ? styles.success : styles.error}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
