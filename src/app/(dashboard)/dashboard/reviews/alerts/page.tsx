"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type ChurnAlertStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

type ChurnAlert = {
  id: string;
  source: string;
  guardianSegment: string;
  parentType?: string;
  studentGrade: string;
  rating: number | null;
  riskLevel: string;
  risk?: string;
  category: string;
  status: ChurnAlertStatus;
  statusLabel: string;
  rawStatus?: ChurnAlertStatus;
  reason: string;
  content?: string;
  aiActionProposal: string;
  aiAdvice?: string;
  assignedTo: string;
  detectedAt?: string;
  createdAt: string;
};

type ChurnAlertSummary = {
  total?: number;
  totalAlerts: number;
  openCount: number;
  inProgressCount: number;
  highRiskCount: number;
  resolvedCount: number;
};

type ChurnAlertResponse = {
  success?: boolean;
  error?: string;
  summary?: ChurnAlertSummary;
  alerts?: ChurnAlert[];
  items?: ChurnAlert[];
};

const EMPTY_SUMMARY: ChurnAlertSummary = {
  totalAlerts: 0,
  openCount: 0,
  inProgressCount: 0,
  highRiskCount: 0,
  resolvedCount: 0,
};

const STATUS_OPTIONS: { value: ChurnAlertStatus; label: string }[] = [
  { value: "OPEN", label: "未対応" },
  { value: "IN_PROGRESS", label: "対応中" },
  { value: "RESOLVED", label: "解決済" },
];

function AlertIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 3l9 16H3L12 3z" />
      <path d="M12 9v4" />
      <path d="M12 17h.1" />
    </svg>
  );
}

function statusClass(status: ChurnAlertStatus) {
  if (status === "RESOLVED") {
    return `${styles.status} ${styles.done}`;
  }

  if (status === "IN_PROGRESS") {
    return `${styles.status} ${styles.progress}`;
  }

  return `${styles.status} ${styles.todo}`;
}

function normalizeStatus(value: string | undefined): ChurnAlertStatus {
  if (value === "RESOLVED" || value === "解決済") {
    return "RESOLVED";
  }

  if (value === "IN_PROGRESS" || value === "対応中") {
    return "IN_PROGRESS";
  }

  return "OPEN";
}

function riskLabel(alert: ChurnAlert) {
  if (alert.risk) {
    return alert.risk;
  }

  if (alert.riskLevel === "HIGH") {
    return "高リスク";
  }

  if (alert.riskLevel === "LOW") {
    return "低リスク";
  }

  return "中リスク";
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildSummaryFromAlerts(alerts: ChurnAlert[]): ChurnAlertSummary {
  return {
    total: alerts.length,
    totalAlerts: alerts.length,
    openCount: alerts.filter((alert) => normalizeStatus(alert.rawStatus || alert.status) === "OPEN").length,
    inProgressCount: alerts.filter(
      (alert) => normalizeStatus(alert.rawStatus || alert.status) === "IN_PROGRESS",
    ).length,
    highRiskCount: alerts.filter((alert) => alert.riskLevel === "HIGH").length,
    resolvedCount: alerts.filter(
      (alert) => normalizeStatus(alert.rawStatus || alert.status) === "RESOLVED",
    ).length,
  };
}

function normalizeSummary(
  summary: ChurnAlertSummary | undefined,
  alerts: ChurnAlert[],
): ChurnAlertSummary {
  const computed = buildSummaryFromAlerts(alerts);

  return {
    total: summary?.total ?? summary?.totalAlerts ?? computed.total,
    totalAlerts: summary?.totalAlerts ?? summary?.total ?? computed.totalAlerts,
    openCount: summary?.openCount ?? computed.openCount,
    inProgressCount: summary?.inProgressCount ?? computed.inProgressCount,
    highRiskCount: summary?.highRiskCount ?? computed.highRiskCount,
    resolvedCount: summary?.resolvedCount ?? computed.resolvedCount,
  };
}

export default function RetentionAlertsPage() {
  const searchParams = useSearchParams();
  const selectedSchoolId = searchParams.get("schoolId") || "";
  const [summary, setSummary] = useState<ChurnAlertSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<ChurnAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();

    if (selectedSchoolId) {
      params.set("schoolId", selectedSchoolId);
    }

    setIsLoading(true);
    setErrorMessage("");

    fetch(`/api/dashboard/churn-alert?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as ChurnAlertResponse;

        if (!response.ok || body.success === false) {
          throw new Error(body.error || "退塾防止アラートを取得できませんでした。");
        }

        const nextAlerts = Array.isArray(body.alerts)
          ? body.alerts
          : Array.isArray(body.items)
            ? body.items
            : [];

        setSummary(normalizeSummary(body.summary, nextAlerts));
        setAlerts(nextAlerts);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setSummary(EMPTY_SUMMARY);
        setAlerts([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "退塾防止アラートを取得できませんでした。",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedSchoolId]);

  async function updateStatus(alertId: string, status: ChurnAlertStatus) {
    setUpdatingId(alertId);
    setErrorMessage("");

    try {
      const response = await fetch("/api/dashboard/churn-alert", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, status }),
      });
      const body = (await response.json()) as ChurnAlertResponse & {
        alert?: ChurnAlert;
      };

      if (!response.ok || body.success === false || !body.alert) {
        throw new Error(body.error || "ステータスを更新できませんでした。");
      }

      setAlerts((current) => {
        const nextAlerts = current.map((alert) =>
          alert.id === alertId ? body.alert as ChurnAlert : alert,
        );
        setSummary(buildSummaryFromAlerts(nextAlerts));

        return nextAlerts;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ステータスを更新できませんでした。",
      );
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Silent Guardian Alerts</p>
        <h1>サイレント保護者検知・退塾防止アラート</h1>
        <p>低評価口コミ・アンケート回答を外部化する前に、内部対応として管理します。</p>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <AlertIcon />
          <span>改善要請</span>
          <strong>{(summary.totalAlerts ?? summary.total ?? 0).toLocaleString("ja-JP")}件</strong>
        </article>
        <article>
          <AlertIcon />
          <span>未対応</span>
          <strong>{summary.openCount.toLocaleString("ja-JP")}件</strong>
        </article>
        <article>
          <AlertIcon />
          <span>高リスク</span>
          <strong>{summary.highRiskCount.toLocaleString("ja-JP")}件</strong>
        </article>
        <article>
          <AlertIcon />
          <span>解決済</span>
          <strong>{summary.resolvedCount.toLocaleString("ja-JP")}件</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <AlertIcon />
          <div>
            <h2>改善要請一覧</h2>
            <p>
              {isLoading
                ? "退塾リスクを確認しています。"
                : errorMessage || "評価点、保護者属性、不満カテゴリ、AI対応策を確認します。"}
            </p>
          </div>
        </div>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>リスク</th>
                <th>評価</th>
                <th>保護者属性</th>
                <th>カテゴリ</th>
                <th>検知日時</th>
                <th>ステータス</th>
                <th>AI対応策アドバイス</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length > 0 ? alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>{riskLabel(alert)}</td>
                  <td>{alert.rating ? `★${alert.rating}` : "-"}</td>
                  <td>
                    <strong>{alert.parentType || alert.guardianSegment}</strong>
                    <span>{alert.studentGrade}</span>
                  </td>
                  <td>
                    <strong>{alert.category}</strong>
                    <span>{alert.content || alert.reason || "詳細理由は未入力です。"}</span>
                  </td>
                  <td>{formatDate(alert.detectedAt || alert.createdAt)}</td>
                  <td>
                    <span className={statusClass(normalizeStatus(alert.rawStatus || alert.status))}>
                      {alert.statusLabel || alert.status}
                    </span>
                    <div className={styles.actions}>
                      {STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          disabled={
                            updatingId === alert.id ||
                            normalizeStatus(alert.rawStatus || alert.status) === option.value
                          }
                          onClick={() => updateStatus(alert.id, option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>{alert.aiAdvice || alert.aiActionProposal}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className={styles.empty}>
                    {isLoading
                      ? "退塾防止アラートを読み込んでいます。"
                      : "未対応の退塾防止アラートはありません。"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
