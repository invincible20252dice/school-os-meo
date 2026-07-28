import { buildMockRankTrackerDashboard } from "@/lib/rank-tracker";
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

export default function RankTrackerPage() {
  const dashboard = buildMockRankTrackerDashboard();
  const maxRank = 8;

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
          <strong>{dashboard.target.keyword}</strong>
        </article>
        <article>
          <TrendIcon />
          <span>最新順位</span>
          <strong>{formatRank(dashboard.latest.rank)}</strong>
        </article>
        <article>
          <PinIcon />
          <span>前回比</span>
          <strong>
            {dashboard.latest.change && dashboard.latest.change > 0
              ? `+${dashboard.latest.change}`
              : dashboard.latest.change}
          </strong>
        </article>
      </section>

      <section className={styles.locationPanel}>
        <div className={styles.panelTitle}>
          <PinIcon />
          <div>
            <h2>計測位置パラメータ</h2>
            <p>{dashboard.searchLabel}</p>
          </div>
        </div>
        <div className={styles.locationGrid}>
          <div>
            <span>校舎</span>
            <strong>{dashboard.target.schoolName}</strong>
          </div>
          <div>
            <span>市町村</span>
            <strong>{dashboard.target.location.municipality}</strong>
          </div>
          <div>
            <span>最寄り駅</span>
            <strong>{dashboard.target.location.nearestStation}</strong>
          </div>
          <div>
            <span>緯度・経度</span>
            <strong>
              {dashboard.target.location.latitude},{" "}
              {dashboard.target.location.longitude}
            </strong>
          </div>
          <div>
            <span>計測半径</span>
            <strong>{dashboard.target.location.radiusMeters}m</strong>
          </div>
          <div>
            <span>計測時刻</span>
            <strong>{dashboard.latest.checkedAt}</strong>
          </div>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <TrendIcon />
            <div>
              <h2>順位推移</h2>
              <p>直近7日間のMock履歴です。</p>
            </div>
          </div>
          <div className={styles.chart}>
            {dashboard.history.map((item) => (
              <div key={item.date} className={styles.chartItem}>
                <span>{item.rank}位</span>
                <div
                  style={{
                    height: `${Math.max(18, (maxRank - item.rank + 1) * 18)}px`,
                  }}
                />
                <small>{item.date.slice(5)}</small>
              </div>
            ))}
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
            <strong>{formatRank(dashboard.latest.rank)}</strong>
            <span>上位20店舗中</span>
            <p>
              自校舎は3位に表示されています。1位・2位との差分は口コミ数と駅前エリアでの露出です。
            </p>
          </div>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <MapIcon />
          <div>
            <h2>上位20店舗</h2>
            <p>自校舎は強調表示しています。</p>
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
              {dashboard.competitors.map((competitor) => (
                <tr
                  key={competitor.placeId}
                  className={competitor.isOwnSchool ? styles.ownRow : undefined}
                >
                  <td>{competitor.rank}</td>
                  <td>{competitor.name}</td>
                  <td>{competitor.rating?.toFixed(1) ?? "-"}</td>
                  <td>{competitor.reviewCount ?? "-"}</td>
                  <td>{competitor.address ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
