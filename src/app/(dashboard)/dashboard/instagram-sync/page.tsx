import { buildMockInstagramSyncPreview } from "@/lib/mock-instagram-sync";
import InstagramRealSyncButton from "@/components/dashboard/InstagramRealSyncButton";
import {
  buildRankSearchLabel,
  normalizeLocationParams,
} from "@/lib/location-params";
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

export default async function InstagramSyncPage() {
  const preview = await buildMockInstagramSyncPreview();
  const location = normalizeLocationParams({
    nearestStation: "横浜駅",
    municipality: "横浜市西区",
    latitude: 35.4658,
    longitude: 139.6223,
    radiusMeters: 1500,
  });
  const searchLabel = buildRankSearchLabel({
    keyword: "個別指導 塾",
    location,
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Instagram Mock Sync</p>
        <h1>Instagram連携のMock実行プレビュー</h1>
        <p>
          実APIやDB書き込みを使わずに、Instagram投稿取得、AIリライト、GBP投稿payload生成までの流れを確認します。
        </p>
        <InstagramRealSyncButton />
      </header>

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
              <p>{preview.instagram.postedAt.toISOString().slice(0, 10)}</p>
            </div>
          </div>
          <p className={styles.caption}>{preview.instagram.caption}</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <GbpIcon />
            <div>
              <h2>AIリライト後のGBP投稿文</h2>
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
    </main>
  );
}
