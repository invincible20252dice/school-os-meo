"use client";

import React from "react";
import { useEffect, useMemo, useState } from "react";
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
import {
  buildPublicSurveyPreviewSteps,
  extractPublicSurveyQuestions,
} from "@/lib/public-survey-response";
import type { SerializedPublicSurveyResponse } from "@/lib/public-survey-query";
import styles from "./survey.module.css";

type SurveyClientProps = {
  schoolId: string;
  surveyId: string;
  initialData?: SerializedPublicSurveyResponse | null;
  initialDebugError?: string;
};

type PublicSurveyItem = {
  id: string;
  type: string;
  internalType?: string;
  title?: string;
  question: string;
  maxSelect?: number | null;
  options: string[];
  order: number;
  placeholder?: string;
};

type PublicSurvey = {
  id: string;
  title: string;
  keywords?: string;
  requiredKeywords: string;
  minChars?: number;
  maxChars?: number;
  minCharCount: number;
  maxCharCount: number;
  reward?: string;
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

function getInitialQuestions(data?: SerializedPublicSurveyResponse | null) {
  return data ? extractPublicSurveyQuestions(data) : [];
}

function getInitialTextRange(data?: SerializedPublicSurveyResponse | null) {
  return {
    min: data?.survey?.minChars || data?.survey?.minCharCount || 100,
    max: data?.survey?.maxChars || data?.survey?.maxCharCount || 300,
  };
}

export default function SurveyClient({
  schoolId,
  surveyId,
  initialData,
  initialDebugError = "",
}: SurveyClientProps) {
  const initialQuestions = useMemo(() => getInitialQuestions(initialData), [initialData]);
  const [schoolName, setSchoolName] = useState(
    initialData?.schoolName ||
      initialData?.school?.name ||
      DEFAULT_PUBLIC_SCHOOL_NAME,
  );
  const [surveyTitle, setSurveyTitle] = useState(
    initialData?.survey?.title || "通塾体験を口コミ文に整えます",
  );
  const [surveyItems, setSurveyItems] = useState<PublicSurveyItem[]>(initialQuestions);
  const [surveyTextRange, setSurveyTextRange] = useState(() =>
    getInitialTextRange(initialData),
  );
  const [answers, setAnswers] = useState<PublicSurveyAnswerState>(() =>
    createInitialPublicSurveyAnswers(initialQuestions),
  );
  const [googleReviewUrl, setGoogleReviewUrl] = useState(
    initialData?.googleReviewUrl || DEFAULT_GOOGLE_REVIEW_URL,
  );
  const [reviews, setReviews] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugError, setDebugError] = useState(initialDebugError);
  const [responseNotice, setResponseNotice] = useState("");
  const [isSettingLoading, setIsSettingLoading] = useState(!initialData);
  const [hasLoadedSurveySetting, setHasLoadedSurveySetting] = useState(
    Boolean(initialData),
  );
  const previewSteps = useMemo(
    () =>
      buildPublicSurveyPreviewSteps({
        questions: surveyItems,
        title: surveyTitle,
        schoolId,
        minCharCount: surveyTextRange.min,
        maxCharCount: surveyTextRange.max,
      }),
    [schoolId, surveyItems, surveyTextRange.max, surveyTextRange.min, surveyTitle],
  );

  useEffect(() => {
    if (initialData) {
      const questions = extractPublicSurveyQuestions(initialData);
      setDebugError(
        !initialData.success || questions.length === 0
          ? JSON.stringify(
              {
                source: "server-component",
                httpStatus: initialData.success ? 200 : 404,
                message:
                  "message" in initialData ? initialData.message : undefined,
                error: "error" in initialData ? initialData.error : undefined,
                response: initialData,
              },
              null,
              2,
            )
          : "",
      );
      setSchoolName(
        initialData.schoolName ||
          initialData.school?.name ||
          DEFAULT_PUBLIC_SCHOOL_NAME,
      );
      setGoogleReviewUrl(initialData.googleReviewUrl || DEFAULT_GOOGLE_REVIEW_URL);

      if (initialData.survey) {
        setSurveyTitle(initialData.survey.title);
        setSurveyItems(questions);
        setSurveyTextRange(getInitialTextRange(initialData));
        setAnswers(createInitialPublicSurveyAnswers(questions));
      } else if (questions.length) {
        setSurveyItems(questions);
        setAnswers(createInitialPublicSurveyAnswers(questions));
      }

      setHasLoadedSurveySetting(true);
      setIsSettingLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    async function loadPublicSurveySetting() {
      setIsSettingLoading(true);
      setHasLoadedSurveySetting(false);

      try {
        const endpoint = `/api/public/survey-school?schoolId=${encodeURIComponent(
          schoolId,
        )}${surveyId ? `&surveyId=${encodeURIComponent(surveyId)}` : ""}`;
        const response = await fetch(
          endpoint,
          { signal: controller.signal },
        );
        const rawText = await response.text();
        let data: {
          school?: { name?: string };
          schoolName?: string;
          survey?: PublicSurvey | null;
          questions?: PublicSurveyItem[];
          items?: PublicSurveyItem[];
          googleReviewUrl?: string;
          message?: string;
          error?: string;
          stack?: string;
          status?: number;
        };

        try {
          data = JSON.parse(rawText) as typeof data;
        } catch (parseError) {
          data = {
            message: "APIレスポンスをJSONとして解析できませんでした。",
            error:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          };
        }

        if (data.schoolName || data.school?.name) {
          setSchoolName(data.schoolName || data.school?.name || DEFAULT_PUBLIC_SCHOOL_NAME);
        }

        if (data.googleReviewUrl) {
          setGoogleReviewUrl(data.googleReviewUrl);
        }

        const questions = extractPublicSurveyQuestions(data);

        setDebugError(
          !response.ok || questions.length === 0
            ? JSON.stringify(
                {
                  source: "client-fetch",
                  endpoint,
                  httpStatus: response.status,
                  ok: response.ok,
                  message: data.message,
                  error: data.error,
                  stack: data.stack,
                  rawResponse: rawText,
                  parsedResponse: data,
                  questionCount: questions.length,
                },
                null,
                2,
              )
            : "",
        );

        if (data.survey) {
          setSurveyTitle(data.survey.title);
          setSurveyItems(questions);
          setSurveyTextRange({
            min: data.survey.minChars || data.survey.minCharCount,
            max: data.survey.maxChars || data.survey.maxCharCount,
          });
          setAnswers(createInitialPublicSurveyAnswers(questions));
        } else if (questions.length) {
          setSurveyItems(questions);
          setAnswers(createInitialPublicSurveyAnswers(questions));
        }

        if (!response.ok) {
          setSchoolName(data.school?.name || DEFAULT_PUBLIC_SCHOOL_NAME);
          setGoogleReviewUrl(DEFAULT_GOOGLE_REVIEW_URL);
        }
      } catch (fetchError) {
        setDebugError(
          JSON.stringify(
            {
              source: "client-fetch",
              message: "公開アンケートAPIの取得中に例外が発生しました。",
              error:
                fetchError instanceof Error
                  ? fetchError.message
                  : String(fetchError),
              stack: fetchError instanceof Error ? fetchError.stack : undefined,
              schoolId,
              surveyId,
            },
            null,
            2,
          ),
        );
        setSchoolName(DEFAULT_PUBLIC_SCHOOL_NAME);
        setGoogleReviewUrl(DEFAULT_GOOGLE_REVIEW_URL);
      } finally {
        window.clearTimeout(timeoutId);
        setHasLoadedSurveySetting(true);
        setIsSettingLoading(false);
      }
    }

    void loadPublicSurveySetting();

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [initialData, schoolId, surveyId]);

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
    if (isSettingLoading || !hasLoadedSurveySetting || surveyItems.length === 0) {
      setError("アンケート設問の読み込み完了後に生成してください。");
      return;
    }

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
          {isSettingLoading || !hasLoadedSurveySetting ? (
            <div className={styles.loadingState} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <strong>アンケート設問を読み込んでいます</strong>
                <p>保存済みの設問を確認してから表示します。</p>
              </div>
            </div>
          ) : previewSteps.length ? (
            previewSteps.map((item) => (
              <section className={styles.previewStep} key={item.id}>
                <span className={styles.questionNumber}>Q{item.order}</span>
                <h2>{item.question}</h2>
                <p>{item.helperText}</p>
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
                      現在 {String(answers[item.id] || "").length}文字
                    </span>
                  </>
                ) : (
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
                )}
              </section>
            ))
          ) : (
            <div className={styles.error}>
              <strong>設問データを取得できませんでした。</strong>
              <pre className={styles.debugPre}>
                {debugError ||
                  JSON.stringify(
                    {
                      source: "render",
                      message: "設問配列が空です。",
                      schoolId,
                      surveyId,
                      surveyTitle,
                      schoolName,
                    },
                    null,
                    2,
                  )}
              </pre>
            </div>
          )}

          <button
            type="button"
            onClick={generateReviews}
            disabled={isLoading || isSettingLoading || !hasLoadedSurveySetting || surveyItems.length === 0}
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
