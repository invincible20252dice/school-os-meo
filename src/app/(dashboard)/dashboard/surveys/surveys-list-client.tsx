"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildSurveyPublicUrl } from "@/lib/survey-public-url";
import styles from "./page.module.css";

type SurveyListItem = {
  id: string;
  schoolId: string;
  schoolName: string;
  title: string;
  requiredKeywords: string;
  minCharCount: number;
  maxCharCount: number;
  isValid?: boolean;
  isActive?: boolean;
  status?: string;
  hasIncentive: boolean;
  benefitType: string;
  itemCount?: number;
  questionCount?: number;
  characterRange?: string;
  reward?: string;
  updatedAt: string;
};

type SurveysResponse = {
  surveys?: SurveyListItem[];
  message?: string;
  access?: {
    role: string;
    effectiveSchoolId: string;
  };
};

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v4h4" />
      <path d="M6 22v-4H2" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M14 3h7v7" />
      <path d="M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "更新日時なし";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
}

function isSurveyActive(survey: SurveyListItem) {
  if (typeof survey.isValid === "boolean") {
    return survey.isValid;
  }

  if (typeof survey.isActive === "boolean") {
    return survey.isActive;
  }

  return survey.status !== "停止中";
}

function getQuestionCount(survey: SurveyListItem) {
  return survey.itemCount ?? survey.questionCount ?? 0;
}

function getCharacterRange(survey: SurveyListItem) {
  return survey.characterRange || `${survey.minCharCount}-${survey.maxCharCount}`;
}

function getRewardLabel(survey: SurveyListItem) {
  if (survey.hasIncentive) {
    return survey.benefitType || survey.reward || "あり";
  }

  return survey.reward || "なし";
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export default function SurveysListClient() {
  const searchParams = useSearchParams();
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [accessLabel, setAccessLabel] = useState("権限を確認中");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [publicOrigin, setPublicOrigin] = useState("");
  const selectedSchoolId = searchParams.get("schoolId") || "";

  function getSurveyPublicUrl(schoolId: string, surveyId: string) {
    return buildSurveyPublicUrl(
      publicOrigin,
      selectedSchoolId || schoolId,
      surveyId,
    );
  }

  function getSurveyEditUrl(survey: SurveyListItem) {
    const params = new URLSearchParams();
    const targetSchoolId = selectedSchoolId || survey.schoolId;

    if (targetSchoolId) {
      params.set("schoolId", targetSchoolId);
    }

    const query = params.toString();

    return `/dashboard/surveys/${survey.id}/edit${query ? `?${query}` : ""}`;
  }

  function getNewSurveyUrl() {
    return selectedSchoolId
      ? `/dashboard/surveys/new?schoolId=${encodeURIComponent(selectedSchoolId)}`
      : "/dashboard/surveys/new";
  }

  async function copySurveyUrl(schoolId: string, surveyId: string) {
    try {
      const url = getSurveyPublicUrl(schoolId, surveyId);
      await navigator.clipboard.writeText(url);
      setCopyMessage("URLをコピーしました");
      window.setTimeout(() => setCopyMessage(null), 2400);
    } catch {
      setCopyMessage("URLをコピーできませんでした。");
    }
  }

  async function loadSurveys() {
    setIsLoading(true);
    setMessage(null);

    try {
      const params = new URLSearchParams();

      if (selectedSchoolId) {
        params.set("schoolId", selectedSchoolId);
      }

      const response = await fetch(
        `/api/surveys${params.toString() ? `?${params.toString()}` : ""}`,
        {
        method: "GET",
        headers: await getAuthHeaders(),
        cache: "no-store",
        },
      );
      const data = (await response.json()) as SurveysResponse;

      if (!response.ok) {
        throw new Error(data.message || "アンケート設定一覧を取得できませんでした。");
      }

      setSurveys(data.surveys || []);
      setAccessLabel(
        data.access
          ? `${data.access.role === "admin" ? "本部" : "教室長"} / ${
              data.access.effectiveSchoolId === "all"
                ? "全校舎"
                : data.access.effectiveSchoolId
            }`
          : "権限情報なし",
      );
    } catch (error) {
      setSurveys([]);
      setAccessLabel("権限情報を確認できませんでした");
      setMessage(
        error instanceof Error
          ? error.message
          : "アンケート設定一覧を取得できませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    setPublicOrigin(window.location.origin);
    void loadSurveys();
  }, [selectedSchoolId]);

  return (
    <>
      <div className={styles.toolbar}>
        <div>
          <span className={styles.accessLabel}>{accessLabel}</span>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={loadSurveys} disabled={isLoading}>
            <RefreshIcon />
            {isLoading ? "取得中" : "再取得"}
          </button>
          <Link href={getNewSurveyUrl()}>
            <PlusIcon />
            新規作成
          </Link>
        </div>
      </div>

      {message ? <p className={styles.error}>{message}</p> : null}
      {copyMessage ? (
        <div className={styles.toast} role="status" aria-live="polite">
          {copyMessage}
        </div>
      ) : null}

      {isLoading ? (
        <section className={styles.emptyPanel}>
          <p>アンケート設定を読み込んでいます。</p>
        </section>
      ) : surveys.length === 0 ? (
        <section className={styles.emptyPanel}>
          <h2>アンケート設定はまだありません</h2>
          <p>新規作成から保存すると、この一覧に反映されます。</p>
        </section>
      ) : (
        <div className={styles.list}>
          {surveys.map((survey) => (
            <section className={styles.panel} key={survey.id}>
              {(() => {
                const active = isSurveyActive(survey);

                return (
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.titleRow}>
                    <h2>{survey.title}</h2>
                    <span
                      className={
                        active ? styles.statusActive : styles.statusPaused
                      }
                    >
                      {active ? "有効" : "停止中"}
                    </span>
                  </div>
                  <p>{survey.requiredKeywords || "必須キーワード未設定"}</p>
                </div>
                <div className={styles.cardActions}>
                  <Link href={getSurveyEditUrl(survey)}>編集</Link>
                  <button
                    type="button"
                    disabled={!publicOrigin}
                    onClick={() => void copySurveyUrl(survey.schoolId, survey.id)}
                  >
                    <CopyIcon />
                    URLをコピー
                  </button>
                  <a
                    href={
                      publicOrigin
                        ? getSurveyPublicUrl(survey.schoolId, survey.id)
                        : "#"
                    }
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!publicOrigin}
                  >
                    <ExternalLinkIcon />
                    アンケートを開く
                  </a>
                </div>
              </div>
                );
              })()}
              <dl className={styles.meta}>
                <div>
                  <dt>校舎</dt>
                  <dd>{survey.schoolName}</dd>
                </div>
                <div>
                  <dt>設問数</dt>
                  <dd>{getQuestionCount(survey)}</dd>
                </div>
                <div>
                  <dt>文字数</dt>
                  <dd>{getCharacterRange(survey)}</dd>
                </div>
                <div>
                  <dt>特典</dt>
                  <dd>{getRewardLabel(survey)}</dd>
                </div>
                <div>
                  <dt>最終更新</dt>
                  <dd>{formatDate(survey.updatedAt)}</dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
