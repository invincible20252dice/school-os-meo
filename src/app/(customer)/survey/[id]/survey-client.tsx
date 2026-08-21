"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
} from "@/lib/google-review-url";
import styles from "./survey.module.css";

const reasonOptions = [
  "先生の説明がわかりやすい",
  "質問しやすい雰囲気",
  "学習習慣がついた",
  "成績や理解度が上がった",
  "教室が通いやすい",
  "保護者への連絡が丁寧",
];

type SurveyClientProps = {
  schoolId: string;
  surveyId: string;
};

type PublicSurveyItem = {
  id: string;
  type: string;
  question: string;
  maxSelect?: number | null;
  options: string[];
  order: number;
};

type PublicSurvey = {
  id: string;
  title: string;
  requiredKeywords: string;
  minCharCount: number;
  maxCharCount: number;
  benefitType: string;
  benefitShowTiming: string;
  items: PublicSurveyItem[];
};

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
      <path d="M18.5 15l.8 2.7L22 18.5l-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M14 4h6v6" />
      <path d="M10 14L20 4" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </svg>
  );
}

export default function SurveyClient({ schoolId, surveyId }: SurveyClientProps) {
  const [schoolName, setSchoolName] = useState(DEFAULT_PUBLIC_SCHOOL_NAME);
  const [surveyTitle, setSurveyTitle] = useState("通塾体験を口コミ文に整えます");
  const [surveyItems, setSurveyItems] = useState<PublicSurveyItem[]>([]);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    DEFAULT_GOOGLE_REVIEW_URL,
  );
  const [rating, setRating] = useState(5);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([
    reasonOptions[0],
    reasonOptions[2],
  ]);
  const [freeText, setFreeText] = useState("");
  const [reviews, setReviews] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [responseNotice, setResponseNotice] = useState("");
  const [isSettingLoading, setIsSettingLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    async function loadPublicSurveySetting() {
      setIsSettingLoading(true);

      try {
        const response = await fetch(
          `/api/public/survey-school?schoolId=${encodeURIComponent(
            schoolId,
          )}${surveyId ? `&surveyId=${encodeURIComponent(surveyId)}` : ""}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          school?: { name?: string };
          survey?: PublicSurvey | null;
          googleReviewUrl?: string;
          message?: string;
        };

        if (data.school?.name) {
          setSchoolName(data.school.name);
        }

        if (data.googleReviewUrl) {
          setGoogleReviewUrl(data.googleReviewUrl);
        }

        if (data.survey) {
          setSurveyTitle(data.survey.title);
          setSurveyItems(data.survey.items);
        }

        if (!response.ok) {
          setSchoolName(data.school?.name || DEFAULT_PUBLIC_SCHOOL_NAME);
          setGoogleReviewUrl(DEFAULT_GOOGLE_REVIEW_URL);
        }
      } catch {
        setSchoolName(DEFAULT_PUBLIC_SCHOOL_NAME);
        setGoogleReviewUrl(DEFAULT_GOOGLE_REVIEW_URL);
      } finally {
        window.clearTimeout(timeoutId);
        setIsSettingLoading(false);
      }
    }

    void loadPublicSurveySetting();

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [schoolId, surveyId]);

  function toggleReason(reason: string) {
    setSelectedReasons((current) =>
      current.includes(reason)
        ? current.filter((item) => item !== reason)
        : [...current, reason],
    );
  }

  function toggleSurveyOption(item: PublicSurveyItem, option: string) {
    if (item.type === "SINGLE_SELECT") {
      setSelectedReasons((current) => [
        ...current.filter((reason) => !item.options.includes(reason)),
        option,
      ]);
      return;
    }

    toggleReason(option);
  }

  async function generateReviews() {
    setIsLoading(true);
    setError("");
    setResponseNotice("");
    setCopiedIndex(null);

    try {
      const response = await fetch("/api/generate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolName,
          rating,
          selectedReasons,
          freeText,
        }),
      });

      if (!response.ok) {
        throw new Error("生成に失敗しました");
      }

      const data = (await response.json()) as { reviews: string[] };
      setReviews(data.reviews);

      const saveResponse = await fetch("/api/survey-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId,
          surveyId,
          schoolName,
          rating,
          selectedReasons,
          freeText,
          generatedReviews: data.reviews,
        }),
      });
      const saveData = (await saveResponse.json()) as { message?: string };

      if (!saveResponse.ok) {
        throw new Error(saveData.message || "アンケート回答を保存できませんでした。");
      }

      setResponseNotice("アンケート回答をDBへ保存しました。");
    } catch {
      setError("口コミ生成または回答保存に失敗しました。入力内容を確認して再度お試しください。");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyAndOpen(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.page}>
      <section className={styles.formPanel}>
        <div className={styles.kicker}>Survey</div>
        <h1 className={styles.title}>{surveyTitle}</h1>
        <p className={styles.schoolName}>
          {isSettingLoading
            ? "校舎情報を読み込んでいます"
            : schoolName || DEFAULT_PUBLIC_SCHOOL_NAME}
        </p>

        <div className={styles.formStack}>
          {surveyItems.length ? (
            surveyItems.map((item) => (
              <div className={styles.field} key={item.id}>
                <span className={styles.label}>{item.question}</span>
                {item.type === "TEXT" ? (
                  <textarea
                    value={freeText}
                    onChange={(event) => setFreeText(event.target.value)}
                    rows={5}
                    placeholder="例: 苦手だった数学に自信がつき、家でも自分から机に向かうようになりました。"
                    className={styles.textarea}
                  />
                ) : (
                  <div className={styles.reasonGrid}>
                    {item.options.map((option) => (
                      <label key={option} className={styles.reasonItem}>
                        <input
                          type={
                            item.type === "SINGLE_SELECT" ? "radio" : "checkbox"
                          }
                          name={item.id}
                          checked={selectedReasons.includes(option)}
                          onChange={() => toggleSurveyOption(item, option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <>
              <div className={styles.field}>
                <span className={styles.label}>満足度</span>
                <div className={styles.ratingGrid}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className={
                        rating === value
                          ? `${styles.ratingButton} ${styles.ratingButtonActive}`
                          : styles.ratingButton
                      }
                      aria-pressed={rating === value}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>良かった点</span>
                <div className={styles.reasonGrid}>
                  {reasonOptions.map((reason) => (
                    <label key={reason} className={styles.reasonItem}>
                      <input
                        type="checkbox"
                        checked={selectedReasons.includes(reason)}
                        onChange={() => toggleReason(reason)}
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>自由記述</span>
                <textarea
                  value={freeText}
                  onChange={(event) => setFreeText(event.target.value)}
                  rows={5}
                  placeholder="例: 苦手だった数学に自信がつき、家でも自分から机に向かうようになりました。"
                  className={styles.textarea}
                />
              </label>
            </>
          )}

          <button
            type="button"
            onClick={generateReviews}
            disabled={isLoading}
            className={styles.primaryButton}
          >
            <SparkIcon />
            {isLoading ? "生成中..." : "AIで口コミを3案生成"}
          </button>

          {error ? <p className={styles.error}>{error}</p> : null}
          {responseNotice ? (
            <p className={styles.success}>{responseNotice}</p>
          ) : null}
        </div>
      </section>

      <section className={styles.resultPanel}>
        <div>
          <div className={styles.resultKicker}>Review Patterns</div>
          <h2 className={styles.resultTitle}>コピーして Google 口コミ投稿へ</h2>
        </div>

        {reviews.length === 0 ? (
          <div className={styles.emptyState}>
            アンケート入力後に生成された口コミ候補がここに表示されます。
          </div>
        ) : (
          reviews.map((review, index) => (
            <article key={`${review}-${index}`} className={styles.reviewCard}>
              <div className={styles.reviewHeader}>
                <h3>パターン {index + 1}</h3>
                {copiedIndex === index ? (
                  <span className={styles.copiedBadge}>コピー済み</span>
                ) : null}
              </div>
              <p>{review}</p>
              <button
                type="button"
                onClick={() => copyAndOpen(review, index)}
                className={styles.copyButton}
              >
                <CopyIcon />
                コピーして投稿画面へ
                <ExternalIcon />
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
