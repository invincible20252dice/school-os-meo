"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type ReviewRow = {
  id: string;
  schoolId: string;
  schoolName: string;
  status: string;
  parentName: string;
  rating: number | null;
  originalText: string;
  googleReviewId: string;
  aiReplyText: string;
  repliedAt: string;
  createdAt: string;
};

type ReviewsResponse = {
  reviews?: ReviewRow[];
  message?: string;
};

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.smallIcon}>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.smallIcon}>
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12a9 9 0 0 1 15.5-6.2" />
      <path d="M18.5 2.8v3.5H15" />
      <path d="M5.5 21.2v-3.5H9" />
    </svg>
  );
}

function ratingLabel(rating: number | null) {
  if (!rating) {
    return "評価なし";
  }

  return `${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}`;
}

export default function ReviewsClient() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  const highlightedReviewId = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return new URLSearchParams(window.location.search).get("reviewId") || "";
  }, []);

  async function loadReviews() {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/reviews", { cache: "no-store" });
      const body = (await response.json()) as ReviewsResponse;

      if (!response.ok) {
        throw new Error(body.message || "口コミ一覧を取得できませんでした。");
      }

      const rows = body.reviews || [];
      setReviews(rows);
      setDrafts(
        Object.fromEntries(rows.map((review) => [review.id, review.aiReplyText])),
      );
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "口コミ一覧を取得できませんでした。",
      );
    }
  }

  async function postReply(reviewId: string) {
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/gbp/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId,
          replyText: drafts[reviewId] || "",
        }),
      });
      const body = (await response.json()) as ReviewsResponse;

      if (!response.ok) {
        throw new Error(body.message || "口コミ返信を投稿できませんでした。");
      }

      setMessage("Google口コミへ返信を投稿しました。");
      await loadReviews();
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "口コミ返信を投稿できませんでした。",
      );
    }
  }

  useEffect(() => {
    void loadReviews();
  }, []);

  return (
    <section className={styles.livePanel}>
      <div className={styles.liveHeader}>
        <div>
          <h2>実データの口コミ返信</h2>
          <p>GBPから取得した口コミのAI返信案を確認し、承認後にGoogleへ投稿します。</p>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={loadReviews}>
          <RefreshIcon />
          再読み込み
        </button>
      </div>

      {message ? (
        <p className={status === "error" ? styles.errorMessage : styles.successMessage}>
          {message}
        </p>
      ) : null}

      {status === "loading" ? <p className={styles.muted}>口コミを読み込んでいます。</p> : null}

      {status !== "loading" && reviews.length === 0 ? (
        <p className={styles.muted}>
          未返信の口コミはまだありません。テスト通知またはcron取得後にここへ表示されます。
        </p>
      ) : null}

      <div className={styles.reviewCards}>
        {reviews.map((review) => (
          <article
            key={review.id}
            className={
              review.id === highlightedReviewId
                ? `${styles.reviewCard} ${styles.highlightedCard}`
                : styles.reviewCard
            }
          >
            <div className={styles.reviewCardHeader}>
              <div>
                <strong>{review.schoolName}</strong>
                <span>{review.parentName}</span>
              </div>
              <b>{ratingLabel(review.rating)}</b>
            </div>
            <p className={styles.reviewCardText}>{review.originalText}</p>
            <label className={styles.replyEditor}>
              <span>AI返信案</span>
              <textarea
                value={drafts[review.id] || ""}
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [review.id]: event.target.value,
                  }))
                }
              />
            </label>
            <div className={styles.reviewActions}>
              <span>{review.repliedAt ? "返信済み" : "未返信"}</span>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void postReply(review.id)}
                disabled={status === "saving" || Boolean(review.repliedAt)}
              >
                <SendIcon />
                Googleに返信を投稿する
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
