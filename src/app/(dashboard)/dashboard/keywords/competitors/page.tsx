import {
  buildDifferentiationData,
  findDistrictAnalysis,
} from "@/lib/mock/differentiationData";
import styles from "./page.module.css";

function CompareIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 18h16" />
      <path d="M7 15V8" />
      <path d="M12 15V5" />
      <path d="M17 15v-4" />
    </svg>
  );
}

export default function KeywordCompetitorsPage() {
  const data = buildDifferentiationData();
  const selectedDistrict = data.schoolDistricts?.[0]?.district ?? "";
  const analysis = findDistrictAnalysis(data.schoolDistricts, selectedDistrict);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Local Competitors</p>
        <h1>近隣競合塾・校区別キーワード分析</h1>
        <p>対象校区ごとに、自校と近隣競合塾の強みを比較し、今月打ち出すメッセージを決めます。</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <CompareIcon />
          <div>
            <h2>校区選択</h2>
            <p>現在の分析対象: {analysis?.district ?? "-"}</p>
          </div>
        </div>
        <select defaultValue={selectedDistrict} aria-label="校区選択">
          {data.schoolDistricts?.map((district) => (
            <option key={district?.id} value={district?.district}>
              {district?.district}
            </option>
          ))}
        </select>
      </section>

      <section className={styles.grid}>
        <article className={styles.ownCard}>
          <CompareIcon />
          <span>自校の打ち出しポイント</span>
          <strong>{analysis?.ownAppealPoint ?? "-"}</strong>
        </article>
        {analysis?.competitors?.map((competitor) => (
          <article key={competitor?.id} className={styles.competitorCard}>
            <span>{competitor?.name}</span>
            <strong>{competitor?.appealPoint}</strong>
            <p>
              評価 {competitor?.rating?.toFixed(1)} / 口コミ {competitor?.reviewCount}件
            </p>
          </article>
        ))}
      </section>

      <section className={styles.recommendation}>
        <div className={styles.panelTitle}>
          <CompareIcon />
          <div>
            <h2>AIによる今月の強みメッセージ</h2>
            <p>競合の訴求軸と地域キーワードを踏まえた提案です。</p>
          </div>
        </div>
        <p>{analysis?.aiMessage ?? ""}</p>
      </section>
    </main>
  );
}
