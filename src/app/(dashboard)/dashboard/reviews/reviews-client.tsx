"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  GOOGLE_REVIEW_MANAGEMENT_URL,
  copyReviewReply,
} from "@/lib/review-reply-assist";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./page.module.css";

type ReviewRow = {
  id: string;
  schoolId: string;
  schoolName: string;
  status: string;
  parentName: string;
  authorName: string;
  rating: number | null;
  originalText: string;
  googleReviewId: string;
  aiReplyText: string;
  replyText: string;
  repliedAt: string;
  createdAt: string;
};

type ReviewsResponse = {
  success?: boolean;
  reviews?: ReviewRow[];
  message?: string;
  googlePosted?: boolean;
  deliveryStatus?: "GOOGLE_POSTED" | "LOCAL_SAVED";
};

async function buildAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    const token = data.session?.access_token;

    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
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

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.smallIcon}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.smallIcon}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ratingLabel(rating: number | null) {
  if (!rating) {
    return "評価なし";
  }

  return `${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))}`;
}

function copyTextWithDocument(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("COPY_COMMAND_FAILED");
    }
  } finally {
    textarea.remove();
  }
}

export default function ReviewsClient() {
  const searchParams = useSearchParams();
  const selectedSchoolId = searchParams.get("schoolId") || "";
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
  const reviewRefs = useRef<Record<string, HTMLElement | null>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const routeAction = useMemo(() => {
    if (typeof window === "undefined") {
      return { reviewId: "", action: "" };
    }

    return {
      reviewId: searchParams.get("reviewId") || "",
      action: searchParams.get("action") || "",
    };
  }, [searchParams]);

  const highlightedReviewId = routeAction.reviewId;

  async function loadReviews() {
    setStatus("loading");
    setMessage("");

    try {
      const params = new URLSearchParams();

      if (selectedSchoolId) {
        params.set("schoolId", selectedSchoolId);
      }

      const headers = await buildAuthHeaders();

      const response = await fetch(
        `/api/dashboard/reviews${params.size ? `?${params.toString()}` : ""}`,
        { cache: "no-store", headers },
      );
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

  async function copyReplyForGoogle(reviewId: string) {
    setMessage("");

    try {
      await copyReviewReply(drafts[reviewId] || "", {
        writeText: (text) => navigator.clipboard.writeText(text),
        writeTextFallback: copyTextWithDocument,
      });
      setStatus("idle");
      setMessage(
        "返信文をコピーしました。Googleビジネスプロフィールで貼り付けて返信してください。",
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error && error.message === "REPLY_REQUIRED"
          ? "コピーするAI返信案を入力してください。"
          : "返信文をコピーできませんでした。ブラウザの権限を確認してください。",
      );
    }
  }

  async function markAsReplied(reviewId: string) {
    setStatus("saving");
    setMessage("");

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch("/api/dashboard/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          reviewId,
          replyText: drafts[reviewId] || "",
          schoolId: selectedSchoolId || undefined,
        }),
      });
      const body = (await response.json()) as ReviewsResponse;

      if (!response.ok) {
        throw new Error(body.message || "返信状態を更新できませんでした。");
      }

      await loadReviews();
      setMessage(body.message || "Googleでの返信完了を記録しました。");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "返信状態を更新できませんでした。",
      );
    }
  }

  async function syncGbpReviews() {
    setStatus("loading");
    setMessage("");

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch("/api/dashboard/reviews/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          schoolId: selectedSchoolId || undefined,
        }),
      });
      const body = (await response.json()) as {
        success?: boolean;
        count?: number;
        error?: string;
      };

      if (!response.ok || !body.success) {
        throw new Error(body.error || "Google口コミを同期できませんでした。");
      }

      await loadReviews();
      setMessage(`Google口コミを${body.count ?? 0}件同期しました。`);
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Google口コミを同期できませんでした。",
      );
    }
  }

  useEffect(() => {
    void loadReviews();
  }, [selectedSchoolId]);

  useEffect(() => {
    if (!highlightedReviewId || status === "loading") {
      return;
    }

    const card = reviewRefs.current[highlightedReviewId];
    card?.scrollIntoView({ behavior: "smooth", block: "center" });

    if (routeAction.action === "edit") {
      textareaRefs.current[highlightedReviewId]?.focus();
    }
  }, [highlightedReviewId, routeAction.action, reviews, status]);

  return (
    <section className={styles.livePanel}>
      <div className={styles.liveHeader}>
        <div>
          <h2>実データの口コミ返信</h2>
          <p>
            口コミとAI返信案を確認し、返信文をコピーしてGoogleビジネスプロフィールから返信します。
          </p>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={loadReviews}>
          <RefreshIcon />
          再読み込み
        </button>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => void syncGbpReviews()}
          disabled={status === "loading" || status === "saving"}
        >
          <RefreshIcon />
          GBP口コミを同期
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
          この校舎の口コミはまだありません。「GBP口コミを同期」で最新データを取得できます。
        </p>
      ) : null}

      <div className={styles.reviewCards}>
        {reviews.map((review) => (
          <article
            key={review.id}
            ref={(element) => {
              reviewRefs.current[review.id] = element;
            }}
            className={
              review.id === highlightedReviewId
                ? `${styles.reviewCard} ${styles.highlightedCard}`
                : styles.reviewCard
            }
          >
            <div className={styles.reviewCardHeader}>
              <div>
                <strong>{review.schoolName}</strong>
                <span>{review.authorName || review.parentName}</span>
              </div>
              <b>{ratingLabel(review.rating)}</b>
            </div>
            <p className={styles.reviewCardText}>{review.originalText}</p>
            <label className={styles.replyEditor}>
              <span>AI返信案</span>
              <textarea
                ref={(element) => {
                  textareaRefs.current[review.id] = element;
                }}
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
              <span className={review.repliedAt ? styles.repliedBadge : styles.pendingBadge}>
                {review.repliedAt ? "返信済" : "未返信"}
              </span>
              <div className={styles.actionButtons}>
                <a
                  className={styles.primaryButton}
                  href={GOOGLE_REVIEW_MANAGEMENT_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void copyReplyForGoogle(review.id)}
                >
                  <CopyIcon />
                  AI返信案をコピーしてGoogleで返信
                </a>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void markAsReplied(review.id)}
                  disabled={status === "saving" || Boolean(review.repliedAt)}
                >
                  <CheckIcon />
                  返信済みにする
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
