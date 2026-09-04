"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getQueryCloudScale, type QueryCloudItem } from "@/lib/mock/meoExtendedData";
import styles from "./page.module.css";

type QueryApiItem = {
  id?: string;
  query?: string;
  impressionCount?: number;
  clickCount?: number;
  growthRate?: string;
  intent?: string;
  count?: number;
};

type ReportApiResponse = {
  success?: boolean;
  error?: string;
  targetMonth?: string;
  queries?: QueryApiItem[];
};

function getDefaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeIntent(value: unknown): QueryCloudItem["intent"] {
  return value === "地域" ||
    value === "料金" ||
    value === "講習" ||
    value === "評判" ||
    value === "学年"
    ? value
    : "地域";
}

function normalizeQueries(queries: QueryApiItem[] = []): QueryCloudItem[] {
  return queries.map((query) => ({
    query: query.query?.trim() || "未設定キーワード",
    count: query.impressionCount ?? query.count ?? 0,
    intent: normalizeIntent(query.intent),
  }));
}

function QueryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export default function QueryAnalyticsPage() {
  const searchParams = useSearchParams();
  const selectedSchoolId = searchParams.get("schoolId") || "";
  const [month, setMonth] = useState(searchParams.get("month") || getDefaultMonth());
  const [queries, setQueries] = useState<QueryCloudItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const cloud = getQueryCloudScale(queries);

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
          throw new Error(body.error || "流入語句を取得できませんでした。");
        }

        setQueries(normalizeQueries(body.queries ?? []));
      })
      .catch((error) => {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setQueries([]);
        setErrorMessage(
          error instanceof Error ? error.message : "流入語句を取得できませんでした。",
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
        <p className={styles.kicker}>GBP Queries</p>
        <h1>流入語句分析＆ワードクラウド</h1>
        <p>Googleビジネスプロフィールの検索表示につながった語句を可視化します。</p>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.panelTitle}>
          <QueryIcon />
          <div>
            <h2>検索クエリ分析</h2>
            <p>
              {isLoading
                ? "流入語句を取得しています。"
                : errorMessage || "タグサイズは検索表示数に応じて変わります。"}
            </p>
          </div>
        </div>
        <label>
          <span>対象月</span>
          <select
            value={month}
            aria-label="対象月"
            onChange={(event) => setMonth(event.target.value)}
          >
            <option value={month}>{month}</option>
            <option value="2026-08">2026-08</option>
            <option value="2026-07">2026-07</option>
            <option value="2026-06">2026-06</option>
          </select>
        </label>
        <button type="button">CSVエクスポート</button>
      </section>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <h2>ワードクラウド</h2>
          <div className={styles.cloud}>
            {cloud.length > 0 ? cloud.map((query) => (
              <span key={query?.query} className={styles[`weight${query?.weight ?? 1}`]}>
                {query?.query}
              </span>
            )) : (
              <span className={styles.weight1}>流入語句データを登録してください</span>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <h2>検索数ランキング</h2>
          <ol className={styles.ranking}>
            {queries.map((query) => (
              <li key={query?.query}>
                <div>
                  <strong>{query?.query ?? "-"}</strong>
                  <span>{query?.intent ?? "-"}</span>
                </div>
                <b>{query?.count?.toLocaleString("ja-JP") ?? 0}</b>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
