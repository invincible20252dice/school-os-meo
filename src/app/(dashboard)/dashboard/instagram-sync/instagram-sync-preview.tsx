"use client";
import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { InstagramPreviewResponse } from "@/app/api/instagram/preview/route";
import InstagramRealSyncButton from "@/components/dashboard/InstagramRealSyncButton";
import { buildRankSearchLabel, normalizeLocationParams } from "@/lib/location-params";
import styles from "./page.module.css";

function InstagramIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17.5 6.8h.1" />
    </svg>
  );
}

function GbpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 21s7-6.1 7-12A7 7 0 0 0 5 9c0 5.9 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 2v5" />
      <path d="M8 7h8l-1 6 3 4H6l3-4-1-6z" />
      <path d="M12 17v5" />
    </svg>
  );
}

function PreviewBody({ data }: { data: InstagramPreviewResponse }) {
  const { dashboardData, preview } = data;
  const location = normalizeLocationParams(dashboardData.location);
  const searchLabel = buildRankSearchLabel({ keyword: dashboardData.location.keyword, location });
  return <>
      <section className={styles.notice}>{preview.safety}</section>

      <section className={styles.flowGrid}>
        {preview.timeline.map((item, index) => (
          <article key={item}>
            <span>{index + 1}</span>
            <strong>{item}</strong>
          </article>
        ))}
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <InstagramIcon />
            <div>
              <h2>Mock Instagram投稿</h2>
              <p>
                {dashboardData.syncTimestampUnavailable
                  ? "最終同期日時を取得できません（サンプル表示）"
                  : dashboardData.instagramSetting?.lastSyncedAt
                  ? `最終同期 ${new Date(dashboardData.instagramSetting.lastSyncedAt)
                      .toISOString()
                      .slice(0, 10)}`
                  : "最終同期日時の記録はありません（サンプル表示）"}
              </p>
            </div>
          </div>
          <p className={styles.caption}>{preview.instagram.caption}</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <GbpIcon />
            <div>
              <h2>ローカル整形サンプル</h2>
              <p>{preview.school.name}</p>
            </div>
          </div>
          <p className={styles.formatted}>{preview.formattedText}</p>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <GbpIcon />
          <div>
            <h2>GBP投稿Payload</h2>
            <p>実行時はこの形でLocalPosts APIへ送ります。</p>
          </div>
        </div>
        <pre>{JSON.stringify(preview.gbpPostPayload, null, 2)}</pre>
      </section>

      <section className={styles.locationPanel}>
        <div className={styles.panelTitle}>
          <PinIcon />
          <div>
            <h2>順位計測の位置パラメータ設定</h2>
            <p>最寄り駅・市町村・緯度経度・半径を明示して計測します。</p>
          </div>
        </div>
        <div className={styles.locationGrid}>
          <div>
            <span>市町村名</span>
            <strong>{location.municipality}</strong>
          </div>
          <div>
            <span>最寄り駅</span>
            <strong>{location.nearestStation}</strong>
          </div>
          <div>
            <span>緯度・経度</span>
            <strong>
              {location.latitude}, {location.longitude}
            </strong>
          </div>
          <div>
            <span>計測半径</span>
            <strong>{location.radiusMeters}m</strong>
          </div>
        </div>
        <code>{searchLabel}</code>
      </section>
  </>;
}

export default function InstagramSyncPreview({ schoolId = "" }: { schoolId?: string }) {
  const [loaded, setLoaded] = useState<{ schoolId: string; data: InstagramPreviewResponse } | null>(null);
  const [message, setMessage] = useState("");
  const payload = loaded?.schoolId === schoolId ? loaded.data : null;
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setMessage("");
    async function load() {
      try {
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        if (!data.session?.access_token) throw new Error("ログインしてください。");
        const response = await fetch(`/api/instagram/preview?${new URLSearchParams({ schoolId })}`, {
          headers: { authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "プレビューを取得できませんでした。");
        if (active) setLoaded({ schoolId, data: body });
      } catch (error) {
        if (active) { setLoaded(null); setMessage(error instanceof Error ? error.message : "プレビューを取得できませんでした。"); }
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [schoolId]);
  const selectedSchoolId = schoolId;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Instagram Sync</p>
        <h1>Instagram実績マルチ投稿プレビュー</h1>
        <p>
          認証後、選択中の校舎に対するサンプル投稿とローカル整形のプレビューを表示します。実投稿の取得・AI実行・GBP投稿は行いません。
        </p>
        <InstagramRealSyncButton schoolId={selectedSchoolId} />
      </header>

      {payload ? <PreviewBody data={payload} /> : <p role="status">{message || "プレビューを読み込み中..."}</p>}
    </main>
  );
}
