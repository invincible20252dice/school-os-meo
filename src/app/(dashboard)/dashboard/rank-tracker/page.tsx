import { prisma } from "@/lib/prisma";
import {
  buildDashboardRankingData,
  type DashboardRankingData,
  type DashboardKeywordRankRecord,
  type DashboardSchoolRecord,
  type DashboardTargetKeywordRecord,
} from "@/lib/dashboard-rankings";
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

function emptyDashboardRankingData(): DashboardRankingData {
  return buildDashboardRankingData({
    school: null,
    keywords: [],
    keywordRanks: [],
  });
}

async function loadDashboardRankingData(schoolId?: string) {
  try {
    const school = schoolId
      ? await prisma.school.findUnique({
          where: { id: schoolId },
          select: {
            id: true,
            name: true,
            prefecture: true,
            city: true,
            addressLine: true,
            googlePlaceId: true,
          },
        })
      : null;
    const keywords = await prisma.targetKeyword.findMany({
      where: schoolId ? { schoolId } : undefined,
      orderBy: [{ createdAt: "asc" }],
      include: {
        rankHistories: {
          orderBy: { checkedAt: "desc" },
          take: 20,
        },
        aioScoreHistories: {
          orderBy: { checkedAt: "desc" },
          take: 5,
        },
      },
    });
    const keywordRanks = await prisma.keywordRank.findMany({
      where: schoolId ? { schoolId } : undefined,
      orderBy: { measuredAt: "desc" },
      take: 20,
    });

    return buildDashboardRankingData({
      school: school as DashboardSchoolRecord | null,
      keywords: Array.isArray(keywords)
        ? keywords as DashboardTargetKeywordRecord[]
        : [],
      keywordRanks: Array.isArray(keywordRanks)
        ? keywordRanks as DashboardKeywordRankRecord[]
        : [],
    });
  } catch (error) {
    console.error("[RankTrackerPage] Failed to load ranking data:", error);
    return emptyDashboardRankingData();
  }
}

export default async function RankTrackerPage({
  searchParams,
}: {
  searchParams?: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const dashboard = await loadDashboardRankingData(params?.schoolId);
  const keywords = Array.isArray(dashboard.keywords) ? dashboard.keywords : [];
  const rankingLogs = Array.isArray(dashboard.rankingLogs)
    ? dashboard.rankingLogs
    : [];
  const history = Array.isArray(dashboard.history) ? dashboard.history : [];
  const competitors = Array.isArray(dashboard.competitors)
    ? dashboard.competitors
    : [];
  const targetSchoolName = dashboard.school?.name || "校舎未選択";
  const maxRank = Math.max(
    8,
    ...history.map((item) => item.rank || 0),
  );
  const rankChange =
    dashboard.currentRank && dashboard.previousRank
      ? dashboard.previousRank - dashboard.currentRank
      : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Rank Tracker</p>
        <h1>Googleマップ順位計測デモ</h1>
        <p>
          最寄り駅・市町村・緯度経度・半径を明示して、検索キーワードごとの順位と競合比較を確認します。
        </p>
      </header>

      <section className={styles.summaryGrid}>
        <article>
          <MapIcon />
          <span>対象キーワード</span>
          <strong>{dashboard.currentKeyword || "未登録"}</strong>
        </article>
        <article>
          <TrendIcon />
          <span>最新順位</span>
          <strong>{formatRank(dashboard.currentRank)}</strong>
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
            <strong>{dashboard.school?.municipality || "-"}</strong>
          </div>
          <div>
            <span>最寄り駅</span>
            <strong>{dashboard.school?.nearestStation || "-"}</strong>
          </div>
          <div>
            <span>緯度・経度</span>
            <strong>
              {dashboard.school?.latitude !== undefined &&
              dashboard.school?.longitude !== undefined
                ? `${dashboard.school.latitude}, ${dashboard.school.longitude}`
                : "-"}
            </strong>
          </div>
          <div>
            <span>計測半径</span>
            <strong>{keywords[0] ? `${keywords[0].radiusMeters}m` : "-"}</strong>
          </div>
          <div>
            <span>計測時刻</span>
            <strong>{rankingLogs[0]?.checkedAt || "-"}</strong>
          </div>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <TrendIcon />
            <div>
              <h2>順位推移</h2>
              <p>登録済みキーワードの直近履歴です。</p>
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
                        (maxRank - (item.rank || maxRank) + 1) * 18,
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
            <strong>{formatRank(dashboard.currentRank)}</strong>
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
              <h2>上位20店舗</h2>
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
    </main>
  );
}
