"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_GOOGLE_REVIEW_URL,
  DEFAULT_PUBLIC_SCHOOL_NAME,
} from "@/lib/google-review-url";
import {
  buildReviewGenerationInputFromSurveyAnswers,
  createInitialPublicSurveyAnswers,
  getAnswerValues,
  setSingleSurveyAnswer,
  setTextSurveyAnswer,
  toggleMultiSurveyAnswer,
  type PublicSurveyAnswerState,
} from "@/lib/public-survey-answers";
import styles from "./survey.module.css";

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
  items?: PublicSurveyItem[];
  questions?: PublicSurveyItem[];
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
  const [surveyTextRange, setSurveyTextRange] = useState({
    min: 100,
    max: 300,
  });
  const [answers, setAnswers] = useState<PublicSurveyAnswerState>({});
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    DEFAULT_GOOGLE_REVIEW_URL,
  );
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
          schoolName?: string;
          survey?: PublicSurvey | null;
          questions?: PublicSurveyItem[];
          googleReviewUrl?: string;
          message?: string;
        };

        if (data.schoolName || data.school?.name) {
          setSchoolName(data.schoolName || data.school?.name || DEFAULT_PUBLIC_SCHOOL_NAME);
        }

        if (data.googleReviewUrl) {
          setGoogleReviewUrl(data.googleReviewUrl);
        }

        if (data.survey) {
          const questions = data.questions?.length
            ? data.questions
            : data.survey.questions?.length
            ? data.survey.questions
            : data.survey.items || [];

          setSurveyTitle(data.survey.title);
          setSurveyItems(questions);
          setSurveyTextRange({
            min: data.survey.minCharCount,
            max: data.survey.maxCharCount,
          });
          setAnswers(createInitialPublicSurveyAnswers(questions));
        } else if (data.questions?.length) {
          setSurveyItems(data.questions);
          setAnswers(createInitialPublicSurveyAnswers(data.questions));
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

  function toggleSurveyOption(item: PublicSurveyItem, option: string) {
    if (item.type === "SINGLE_SELECT") {
      setAnswers((current) => setSingleSurveyAnswer(current, item.id, option));
      return;
    }

    setAnswers((current) => toggleMultiSurveyAnswer(current, item, option));
  }

  function updateTextAnswer(item: PublicSurveyItem, value: string) {
    setAnswers((current) => setTextSurveyAnswer(current, item.id, value));
  }

  async function generateReviews() {
    setIsLoading(true);
    setError("");
    setResponseNotice("");
    setCopiedIndex(null);

    try {
      const promptInput = buildReviewGenerationInputFromSurveyAnswers({
        questions: surveyItems,
        answers,
      });
      const response = await fetch("/api/generate-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolName,
          rating: 5,
          selectedReasons: promptInput.selectedReasons,
          freeText: promptInput.freeText,
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
          rating: 5,
          selectedReasons: promptInput.selectedReasons,
          freeText: promptInput.freeText,
          questionAnswers: promptInput.questionAnswers,
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
                  <>
                    <textarea
                      value={String(answers[item.id] || "")}
                      onChange={(event) => updateTextAnswer(item, event.target.value)}
                      rows={5}
                      placeholder="例: 苦手だった数学に自信がつき、家でも自分から机に向かうようになりました。"
                      className={styles.textarea}
                    />
                    <span className={styles.helpText}>
                      現在 {String(answers[item.id] || "").length}文字 / 目安{" "}
                      {surveyTextRange.min}〜{surveyTextRange.max}文字
                    </span>
                  </>
                ) : (
                  <>
                    {item.type === "MULTI_SELECT" && item.maxSelect ? (
                      <span className={styles.helpText}>
                        最大{item.maxSelect}個まで選択できます
                      </span>
                    ) : null}
                  <div className={styles.reasonGrid}>
                    {item.options.map((option) => (
                      <label key={option} className={styles.reasonItem}>
                        <input
                          type={
                            item.type === "SINGLE_SELECT" ? "radio" : "checkbox"
                          }
                          name={item.id}
                          checked={getAnswerValues(answers, item.id).includes(option)}
                          onChange={() => toggleSurveyOption(item, option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                  </>
                )}
              </div>
            ))
          ) : (
            <p className={styles.emptyState}>
              公開中の設問がまだ設定されていません。校舎のアンケート設定を確認してください。
            </p>
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
