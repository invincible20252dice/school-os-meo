"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeMonthlyReportData, type ReportMetric } from "@/lib/mock/reportData";
import {
  buildInsightComparisonItems,
  buildMockInsightComparisonData,
  type InsightComparisonItem,
  type InsightMetricKey,
} from "@/lib/mock/insightData";
import styles from "./page.module.css";

type ReportApiResponse = {
  success?: boolean;
  error?: string;
  targetMonth?: string;
  report?: Parameters<typeof normalizeMonthlyReportData>[0];
};

function getDefaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type ReportIconType =
  | "score"
  | "reviews"
  | "rank"
  | "instagram"
  | "aio"
  | "action"
  | "print"
  | "csv"
  | "views"
  | "mobileViews"
  | "desktopViews"
  | "averageClickRate"
  | "phoneClicks"
  | "directionRequests"
  | "websiteClicks"
  | "detailViews";

function ReportIcon({ type }: { type: ReportIconType }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      {type === "score" ? (
        <>
          <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3z" />
        </>
      ) : null}
      {type === "reviews" ? (
        <>
          <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.2A8 8 0 1 1 21 12z" />
          <path d="M8 10h8" />
          <path d="M8 14h5" />
        </>
      ) : null}
      {type === "rank" ? (
        <>
          <path d="M4 18h16" />
          <path d="M6 15l4-4 3 3 5-7" />
          <path d="M15 7h3v3" />
        </>
      ) : null}
      {type === "instagram" ? (
        <>
          <rect x="4" y="4" width="16" height="16" rx="5" />
          <circle cx="12" cy="12" r="3.5" />
          <path d="M17.5 6.8h.1" />
        </>
      ) : null}
      {type === "aio" ? (
        <>
          <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2" />
          <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2" />
          <path d="M12 4v16" />
        </>
      ) : null}
      {type === "action" ? (
        <>
          <path d="M5 12l4 4L19 6" />
          <path d="M5 20h14" />
        </>
      ) : null}
      {type === "print" ? (
        <>
          <path d="M7 9V4h10v5" />
          <path d="M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
          <path d="M7 14h10v6H7z" />
        </>
      ) : null}
      {type === "csv" ? (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5" />
          <path d="M8 15h8" />
          <path d="M8 18h5" />
        </>
      ) : null}
      {type === "views" ? (
        <>
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : null}
      {type === "mobileViews" ? (
        <>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M11 18h2" />
        </>
      ) : null}
      {type === "desktopViews" ? (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 16v5" />
        </>
      ) : null}
      {type === "averageClickRate" ? (
        <>
          <path d="M5 19L19 5" />
          <circle cx="7" cy="7" r="2" />
          <circle cx="17" cy="17" r="2" />
        </>
      ) : null}
      {type === "phoneClicks" ? (
        <>
          <path d="M6 4l3 2-2 4c1.2 2.4 3.6 4.8 6 6l4-2 2.8 3a2 2 0 0 1-.4 2.8c-1 .7-2.4 1.1-3.7.7C9.8 18.8 5.2 14.2 3.5 8.3 3.1 7 3.5 5.6 4.2 4.6A2 2 0 0 1 6 4z" />
        </>
      ) : null}
      {type === "directionRequests" ? (
        <>
          <path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" />
          <path d="M12 7v6" />
          <path d="M9.5 10.5L12 13l2.5-2.5" />
        </>
      ) : null}
      {type === "websiteClicks" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </>
      ) : null}
      {type === "detailViews" ? (
        <>
          <path d="M5 5h14" />
          <path d="M5 12h14" />
          <path d="M5 19h14" />
          <path d="M4 5h.1" />
          <path d="M4 12h.1" />
          <path d="M4 19h.1" />
        </>
      ) : null}
    </svg>
  );
}

function metricIcon(label: string) {
  if (label.includes("口コミ")) {
    return "reviews";
  }

  if (label.includes("MEO")) {
    return "rank";
  }

  if (label.includes("Instagram")) {
    return "instagram";
  }

  return "aio";
}

function toneClass(tone: ReportMetric["tone"]) {
  if (tone === "good") {
    return `${styles.metricCard} ${styles.good}`;
  }

  if (tone === "alert") {
    return `${styles.metricCard} ${styles.alert}`;
  }

  return `${styles.metricCard} ${styles.watch}`;
}

function insightTrendClass(trend: InsightComparisonItem["trend"]) {
  if (trend === "increase") {
    return `${styles.deltaBadge} ${styles.deltaIncrease}`;
  }

  if (trend === "decrease") {
    return `${styles.deltaBadge} ${styles.deltaDecrease}`;
  }

  return `${styles.deltaBadge} ${styles.deltaFlat}`;
}

export default function MonthlyReportPage() {
  const searchParams = useSearchParams();
  const selectedSchoolId = searchParams.get("schoolId") || "";
  const [month, setMonth] = useState(searchParams.get("month") || getDefaultMonth());
  const [reportData, setReportData] = useState<ReportApiResponse["report"] | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const report = normalizeMonthlyReportData(reportData ?? {});
  const insightComparison = useMemo(() => buildMockInsightComparisonData(), []);
  const insightItems = useMemo(
    () => buildInsightComparisonItems(insightComparison),
    [insightComparison],
  );
  const gaugeDash = `${Math.min(100, Math.max(0, report.score))} ${100 - Math.min(100, Math.max(0, report.score))}`;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("month", month);
    if (selectedSchoolId) {
      params.set("schoolId", selectedSchoolId);
    }

    setIsLoading(true);
    setErrorMessage("");

    fetch(`/api/dashboard/reports?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as ReportApiResponse;
        if (!response.ok || body.success === false) {
          throw new Error(body.error || "月次レポートを取得できませんでした。");
        }

        setReportData(body.report ?? null);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setReportData(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "月次レポートを取得できませんでした。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [month, selectedSchoolId]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Monthly Report</p>
          <h1>月次総合診断レポート</h1>
          <p>{report.schoolName} のMEO・口コミ・Instagram・AIO状況をまとめて確認できます。</p>
        </div>
        <div className={styles.headerActions}>
          <label>
            <span>対象期間</span>
            <select
              value={month}
              aria-label="対象期間"
              onChange={(event) => setMonth(event.target.value)}
            >
              <option value={month}>{report.period}</option>
              <option value="2026-08">2026年8月度</option>
              <option value="2026-07">2026年7月度</option>
              <option value="2026-06">2026年6月度</option>
            </select>
          </label>
          <button type="button" className={styles.printButton}>
            <ReportIcon type="print" />
            PDF出力 / 印刷
          </button>
        </div>
      </header>

      <div className={styles.periodNotice} role={errorMessage ? "alert" : "status"}>
        {isLoading
          ? "月次レポートを取得しています。"
          : errorMessage || "本番DBの月次レポートデータを表示しています。"}
      </div>

      <section className={styles.scorePanel}>
        <div className={styles.scoreVisual}>
          <svg viewBox="0 0 120 120" role="img" aria-label={`総合評価 ${report.score}点`}>
            <circle cx="60" cy="60" r="48" />
            <circle cx="60" cy="60" r="48" pathLength="100" strokeDasharray={gaugeDash} />
          </svg>
          <div>
            <strong>{report.rank}判定</strong>
            <span>{report.score}/100点</span>
          </div>
        </div>
        <div className={styles.scoreCopy}>
          <div className={styles.panelTitle}>
            <ReportIcon type="score" />
            <div>
              <h2>総合評価</h2>
              <p>前月比 {report.monthOverMonth}</p>
            </div>
          </div>
          <p>{report.aiComment}</p>
        </div>
      </section>

      <section className={styles.metrics} aria-label="4大指標サマリー">
        {report.metrics?.map((metric) => (
          <article className={toneClass(metric?.tone ?? "watch")} key={metric?.label}>
            <ReportIcon type={metricIcon(metric?.label ?? "")} />
            <span>{metric?.label ?? ""}</span>
            <strong>{metric?.value ?? ""}</strong>
            <p>{metric?.detail ?? ""}</p>
            <small>{metric?.trend ?? ""}</small>
          </article>
        ))}
      </section>

      <section className={styles.insightPanel} aria-labelledby="insight-comparison-title">
        <div className={styles.insightHeader}>
          <div>
            <p className={styles.kicker}>GBP Insights</p>
            <h2 id="insight-comparison-title">インサイトサマリー</h2>
            <p>登録初期と直近期間を比較し、検索・行動指標の伸びを確認できます。</p>
          </div>
          <div className={styles.insightControls}>
            <label>
              <span>比較期間</span>
              <select defaultValue={insightComparison.period} aria-label="インサイト比較期間">
                <option>{insightComparison.period}</option>
                <option>過去90日間</option>
                <option>今月</option>
              </select>
            </label>
            <button type="button" className={styles.compareButton} aria-pressed="true">
              初期比較
            </button>
            <button type="button" className={styles.csvButton}>
              <ReportIcon type="csv" />
              CSV出力
            </button>
          </div>
        </div>
        <div className={styles.periodNotice}>
          初期期間: {insightComparison.initialPeriod} / 比較対象: {insightComparison.recentPeriod}
        </div>
        <div className={styles.insightGrid}>
          {insightItems.map((item) => (
            <article className={styles.insightCard} key={item.key}>
              <div className={styles.insightCardTop}>
                <ReportIcon type={item.key as InsightMetricKey} />
                <div>
                  <span>{item.label}</span>
                  <small>初期値 {item.initialLabel}</small>
                </div>
              </div>
              <div className={styles.insightCardBottom}>
                <strong>{item.recentLabel}</strong>
                <span className={insightTrendClass(item.trend)}>
                  {item.differenceLabel} / {item.differenceRateLabel}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.actionPanel}>
        <div className={styles.panelTitle}>
          <ReportIcon type="action" />
          <div>
            <h2>改善提案・アクションプラン</h2>
            <p>来月強化すべき施策</p>
          </div>
        </div>
        <ol className={styles.actions}>
          {report.actions?.map((action) => (
            <li key={action?.title}>
              <div>
                <strong>{action?.title ?? ""}</strong>
                <p>{action?.detail ?? ""}</p>
              </div>
              <span>{action?.owner ?? ""}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
