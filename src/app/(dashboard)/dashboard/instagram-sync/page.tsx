import {
  buildMockInstagramSyncPreview,
  DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL,
  DEFAULT_INSTAGRAM_LOCATION,
} from "@/lib/mock-instagram-sync";
import InstagramRealSyncButton from "@/components/dashboard/InstagramRealSyncButton";
import {
  buildRankSearchLabel,
  normalizeLocationParams,
} from "@/lib/location-params";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

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

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

async function loadInstagramDashboardData(schoolId: string) {
  try {
    const [school, keyword, instagramSetting] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: {
          id: true,
          name: true,
          prefecture: true,
          city: true,
          addressLine: true,
          gbpLocationId: true,
        },
      }),
      prisma.targetKeyword.findFirst({
        where: {
          schoolId,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
        select: {
          keyword: true,
          nearestStation: true,
          municipality: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
        },
      }),
      prisma.instagramSetting.findUnique({
        where: { schoolId },
        select: {
          instagramBusinessAccountId: true,
          lastSyncedAt: true,
        },
      }),
    ]);

    return {
      school: {
        id: school?.id || DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL.id,
        name: school?.name || DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL.name,
        gbpLocationId:
          school?.gbpLocationId || DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL.gbpLocationId,
      },
      location: {
        keyword: keyword?.keyword || DEFAULT_INSTAGRAM_LOCATION.keyword,
        nearestStation:
          keyword?.nearestStation || DEFAULT_INSTAGRAM_LOCATION.nearestStation,
        municipality:
          keyword?.municipality ||
          school?.city ||
          DEFAULT_INSTAGRAM_LOCATION.municipality,
        latitude: toNumber(keyword?.latitude) ?? DEFAULT_INSTAGRAM_LOCATION.latitude,
        longitude:
          toNumber(keyword?.longitude) ?? DEFAULT_INSTAGRAM_LOCATION.longitude,
        radiusMeters: keyword?.radiusMeters || DEFAULT_INSTAGRAM_LOCATION.radiusMeters,
      },
      instagramSetting,
    };
  } catch (error) {
    console.error("[Instagram dashboard data lookup failed]:", error);

    return {
      school: DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL,
      location: DEFAULT_INSTAGRAM_LOCATION,
      instagramSetting: null,
    };
  }
}

export default async function InstagramSyncPage({
  searchParams,
}: {
  searchParams?: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const selectedSchoolId = params?.schoolId || DEFAULT_INSTAGRAM_DASHBOARD_SCHOOL.id;
  const dashboardData = await loadInstagramDashboardData(selectedSchoolId);
  const preview = await buildMockInstagramSyncPreview({
    school: dashboardData.school,
  });
  const location = normalizeLocationParams(dashboardData.location);
  const searchLabel = buildRankSearchLabel({
    keyword: dashboardData.location.keyword,
    location,
  });

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Instagram Sync</p>
        <h1>Instagram実績マルチ投稿プレビュー</h1>
        <p>
          選択中の校舎データをもとに、Instagram投稿取得、AIリライト、GBP投稿payload生成までの流れを確認します。
        </p>
        <InstagramRealSyncButton schoolId={selectedSchoolId} />
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
              <p>
                {dashboardData.instagramSetting?.lastSyncedAt
                  ? `最終同期 ${dashboardData.instagramSetting.lastSyncedAt
                      .toISOString()
                      .slice(0, 10)}`
                  : preview.instagram.postedAt.toISOString().slice(0, 10)}
              </p>
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
