"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DashboardRankingData } from "@/lib/dashboard-rankings";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./page.module.css";

function MapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 21s7-6.1 7-12A7 7 0 0 0 5 9c0 5.9 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function TrendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 18h16" />
      <path d="M6 15l4-4 3 3 5-7" />
      <path d="M15 7h3v3" />
    </svg>
  );
}

function formatRank(rank: number | null) {
  return rank ? `${rank}位` : "圏外";
}

export default function RankingClient() {
  const searchParams = useSearchParams();
  const schoolId = searchParams.get("schoolId") || "";
  const [selection, setSelection] = useState({ schoolId: "", keywordId: "" });
  const keywordId = selection.schoolId === schoolId ? selection.keywordId : "";
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: DashboardRankingData; error?: string; fetchedAt?: string }>({ key: "" });
  const key = `${schoolId}/${keywordId}/${reload}`;
  const selected = Boolean(schoolId && schoolId !== "all");
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const { data: session } = await createBrowserSupabaseClient().auth.getSession();
        if (!session.session) throw new Error("ログイン後に順位データを確認してください。");
        const params = new URLSearchParams({ schoolId });
        if (keywordId) params.set("keywordId", keywordId);
        const response = await fetch(`/api/dashboard/keywords/ranking?${params}`, {
          headers: { authorization: `Bearer ${session.session.access_token}` },
          cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || body.success !== true || !body.school || !Array.isArray(body.keywords) || !Array.isArray(body.history) || !Array.isArray(body.competitors)) {
          throw new Error(body.error || "順位データを取得できませんでした。");
        }
        if (!cancelled) setResult({ key, data: body, fetchedAt: new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) });
      } catch (error) {
        if (!cancelled) setResult({ key, error: error instanceof Error ? error.message : "順位データを取得できませんでした。" });
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [schoolId, keywordId, reload, key, selected]);
  const current = result.key === key ? result : null;
  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.kicker}>Rank Tracker</p>
      <h1>Googleマップ順位計測</h1>
    </header>
    {!selected ? <p role="status">ヘッダーから校舎を選択してください。</p> : <>
      <div className={styles.toolbar}>
        <button type="button" disabled={!current} onClick={() => setReload(value => value + 1)}>再取得</button>
        <a href={`/dashboard/keywords?schoolId=${encodeURIComponent(schoolId)}`}>キーワード管理</a>
      </div>
      {!current ? <p role="status">順位データを読み込んでいます。</p> : current.error ? <p role="alert">{current.error}</p> : current.data ? <>
        {current.data.dataSource === "SIMULATION" && <p role="note"><strong>シミュレーション・実測値ではありません</strong>。順位・位置・日時・競合情報は運用検証用サンプルです。</p>}
        <p role="status">{reload > 0 ? (current.data.dataSource === "SIMULATION" ? "シミュレーションデータを再取得しました。" : "保存済みの順位データを再取得しました。") : "データ取得完了。"} 取得日時：{current.fetchedAt}</p>
        <label className={styles.keywordSelect}>対象キーワード
          <select value={current.data.selectedKeyword?.id || ""} onChange={event => setSelection({ schoolId, keywordId: event.target.value })} disabled={!current.data.keywords.length}>
            {!current.data.keywords.length && <option value="">キーワード未登録</option>}
            {current.data.keywords.map(keyword => <option key={keyword.id} value={keyword.id}>{keyword.keyword}</option>)}
          </select>
        </label>
        <RankingView dashboard={current.data} />
      </> : null}
    </>}
  </main>;
}

function RankingView({ dashboard }: { dashboard: DashboardRankingData }) {
  const { history, competitors } = dashboard;
  const targetSchoolName = dashboard.school!.name;
  const rankLabel = dashboard.measuredAt === null ? "未計測" : formatRank(dashboard.currentRank);
  const maxRank = Math.max(
    8,
    ...history.map((item) => item.rank || 0),
  );
  const rankChange =
    dashboard.currentRank && dashboard.previousRank
      ? dashboard.previousRank - dashboard.currentRank
      : null;

  return (
    <>

      <section className={styles.summaryGrid}>
        <article>
          <MapIcon />
          <span>対象キーワード</span>
          <strong>{dashboard.currentKeyword || "未登録"}</strong>
        </article>
        <article>
          <TrendIcon />
          <span>最新順位</span>
          <strong>{rankLabel}</strong>
        </article>
        <article>
          <PinIcon />
          <span>前回比</span>
          <strong>
            {rankChange === null ? "-" : rankChange > 0 ? `+${rankChange}` : rankChange}
          </strong>
        </article>
      </section>

      <section className={styles.locationPanel}>
        <div className={styles.panelTitle}>
          <PinIcon />
          <div>
            <h2>計測位置パラメータ</h2>
            <p>{dashboard.searchLabel || "登録済みキーワードの計測条件を表示します。"}</p>
          </div>
        </div>
        <div className={styles.locationGrid}>
          <div>
            <span>校舎</span>
            <strong>{targetSchoolName}</strong>
          </div>
          <div>
            <span>市町村</span>
            <strong>{dashboard.selectedKeyword?.municipality || "未設定"}</strong>
          </div>
          <div>
            <span>最寄り駅</span>
            <strong>{dashboard.selectedKeyword?.nearestStation || "未設定"}</strong>
          </div>
          <div>
            <span>緯度・経度</span>
            <strong>
              {dashboard.selectedKeyword?.latitude !== undefined &&
              dashboard.selectedKeyword?.longitude !== undefined
                ? `${dashboard.selectedKeyword.latitude}, ${dashboard.selectedKeyword.longitude}`
                : "未設定"}
            </strong>
          </div>
          <div>
            <span>計測半径</span>
            <strong>{dashboard.selectedKeyword ? `${dashboard.selectedKeyword.radiusMeters}m` : "-"}</strong>
          </div>
          <div>
            <span>{dashboard.dataSource === "SIMULATION" ? "サンプル日時" : "計測時刻"}</span>
            <strong>{dashboard.measuredAt ? new Date(dashboard.measuredAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未計測"}</strong>
          </div>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <TrendIcon />
            <div>
              <h2>順位推移</h2>
              <p>最終計測日までの7日間（各日の最終計測）</p>
            </div>
          </div>
          <div className={styles.chart}>
            {history.length ? (
              history.map((item, index) => (
                <div key={`${item.date}-${index}`} className={styles.chartItem}>
                  <span>{item.rank ? `${item.rank}位` : "圏外"}</span>
                  <div
                    style={{
                      height: `${Math.max(
                        18,
                        ((maxRank - (item.rank || maxRank) + 1) / maxRank) * 180,
                      )}px`,
                    }}
                  />
                  <small>{item.date.slice(5) || "-"}</small>
                </div>
              ))
            ) : (
              <p>順位履歴はまだありません。</p>
            )}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <MapIcon />
            <div>
              <h2>競合比較サマリー</h2>
              <p>上位20店舗内での自校舎の立ち位置です。</p>
            </div>
          </div>
          <div className={styles.positionBox}>
            <strong>{rankLabel}</strong>
            <span>上位20店舗中</span>
            <p>
              {dashboard.currentKeyword
                ? `${dashboard.currentKeyword} の現在順位です。`
                : "キーワードを登録すると順位計測の結果が表示されます。"}
            </p>
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
            <MapIcon />
            <div>
              <h2>{dashboard.dataSource === "SIMULATION" ? `競合サンプル ${competitors.length}店舗` : "上位20店舗"}</h2>
              <p>取得済みの競合データを表示します。</p>
            </div>
          </div>
          <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>順位</th>
                <th>店舗名</th>
                <th>評価</th>
                <th>口コミ数</th>
                <th>住所</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((competitor) => (
                <tr
                  key={`${competitor.rank}-${competitor.name}`}
                  className={competitor.isOwnSchool ? styles.ownRow : undefined}
                >
                  <td>{competitor.rank}</td>
                  <td>{competitor.name}</td>
                  <td>{competitor.rating?.toFixed(1) ?? "-"}</td>
                  <td>{competitor.reviewCount ?? "-"}</td>
                  <td>{competitor.address ?? "-"}</td>
                </tr>
              ))}
              {!competitors.length ? (
                <tr>
                  <td colSpan={5}>競合データはまだありません。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
