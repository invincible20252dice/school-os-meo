import { buildMeoExtendedData, formatRank } from "@/lib/mock/meoExtendedData";
import styles from "./page.module.css";

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function badgeClass(label: string) {
  if (label === "上位維持") {
    return `${styles.badge} ${styles.good}`;
  }

  if (label === "要対策") {
    return `${styles.badge} ${styles.alert}`;
  }

  return `${styles.badge} ${styles.watch}`;
}

export default function KeywordTimeRanksPage() {
  const data = buildMeoExtendedData();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Keyword Time Rank</p>
        <h1>時間帯別の検索順位計測</h1>
        <p>昼・夕方〜夜・深夜〜朝でGoogleマップ順位がどう変動するかを確認します。</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <ClockIcon />
          <div>
            <h2>キーワードランキングテーブル</h2>
            <p>時間帯ごとの順位とKPバッジを比較します。</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>キーワード</th>
                <th>検索地点</th>
                {data.keywordTimeRanks[0]?.timeBands?.map((band) => (
                  <th key={band.band}>検索時間帯（{band.label}）</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.keywordTimeRanks?.map((item) => (
                <tr key={item?.id}>
                  <td>
                    <strong>{item?.keyword ?? "-"}</strong>
                  </td>
                  <td>{item?.location ?? "-"}</td>
                  {item?.timeBands?.map((band) => (
                    <td key={band?.band}>
                      <div className={styles.rankCell}>
                        <strong>{formatRank(band?.rank ?? null)}</strong>
                        <span>{band?.measuredAt ?? "-"}</span>
                        <b className={badgeClass(band?.kpBadge ?? "改善余地")}>
                          {band?.kpBadge ?? "改善余地"}
                        </b>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
