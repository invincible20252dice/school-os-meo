import {
  buildDashboardRankingData,
  type DashboardKeywordRankRecord,
  type DashboardSchoolRecord,
  type DashboardTargetKeywordRecord,
} from "@/lib/dashboard-rankings";
import { prisma } from "@/lib/prisma";
import styles from "./page.module.css";

function BrainIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2" />
      <path d="M12 4v16" />
      <path d="M8 9h2" />
      <path d="M14 9h2" />
      <path d="M8 14h2" />
      <path d="M14 14h2" />
    </svg>
  );
}

function ActionIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3z" />
      <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16z" />
    </svg>
  );
}

function scoreLevel(score: number) {
  if (score >= 80) return "高";
  if (score >= 40) return "中";
  return "低";
}

function ScoreCard({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <article className={styles.scoreCard}>
      <div className={styles.scoreHeader}>
        <span>{label}</span>
        <b>{scoreLevel(score)}</b>
      </div>
      <strong>{score}%</strong>
      <div className={styles.progressTrack}>
        <div style={{ width: `${score}%` }} />
      </div>
    </article>
  );
}

async function loadAioScoreDashboard(schoolId?: string) {
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
        take: 1,
      },
      aioScoreHistories: {
        orderBy: { checkedAt: "desc" },
        take: 8,
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
    keywords: keywords as DashboardTargetKeywordRecord[],
    keywordRanks: keywordRanks as DashboardKeywordRankRecord[],
  });
}

export default async function AioScorePage({
  searchParams,
}: {
  searchParams?: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const dashboard = await loadAioScoreDashboard(params?.schoolId);
  const schoolName = dashboard.school?.name || "校舎未選択";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>AIO Score</p>
        <h1>AIOスコア可視化</h1>
        <p>
          ChatGPT、Gemini、Google AIモードで、対象キーワード検索時に自校舎が表示・推奨される確率を可視化します。
        </p>
      </header>

      <section className={styles.summary}>
        <ScoreCard label="ChatGPT" score={dashboard.aio.summary.chatgptScore} />
        <ScoreCard label="Gemini" score={dashboard.aio.summary.geminiScore} />
        <ScoreCard
          label="Google AIモード"
          score={dashboard.aio.summary.googleAiScore}
        />
        <article className={styles.totalCard}>
          <BrainIcon />
          <span>総合AIOスコア</span>
          <strong>{dashboard.aio.summary.totalScore}%</strong>
          <small>{dashboard.aio.checkedAt || "未計測"}</small>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <BrainIcon />
          <div>
            <h2>キーワード別AIO比較</h2>
            <p>{schoolName} のAI検索表示状況です。</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>キーワード</th>
                <th>ChatGPT</th>
                <th>Gemini</th>
                <th>Google AI</th>
                <th>総合</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.aio.keywordRows.map((row) => (
                <tr key={row.keyword}>
                  <td>{row.keyword}</td>
                  <td>{row.chatgptScore}%</td>
                  <td>{row.geminiScore}%</td>
                  <td>{row.googleAiScore}%</td>
                  <td>{row.totalScore}%</td>
                  <td>
                    <span className={styles.status}>{row.status}</span>
                  </td>
                </tr>
              ))}
              {!dashboard.aio.keywordRows.length ? (
                <tr>
                  <td colSpan={6}>AIO計測対象のキーワードはまだ登録されていません。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <ActionIcon />
            <div>
              <h2>AI改善アクション</h2>
              <p>AIから選ばれるための優先施策です。</p>
            </div>
          </div>
          <ul className={styles.actions}>
            <li>TargetKeywordに市町村名、最寄り駅、緯度経度を登録してください。</li>
            <li>Googleビジネスプロフィールと校舎ページに対象キーワードを自然に反映してください。</li>
            <li>AIO計測を実行すると、ここにDB上のスコアが反映されます。</li>
          </ul>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <BrainIcon />
            <div>
              <h2>AI言及文脈</h2>
              <p>{schoolName} のDB計測結果に基づく回答抜粋です。</p>
            </div>
          </div>
          <div className={styles.mentions}>
            <section>
              <h3>ChatGPT</h3>
              <p>{dashboard.aio.mentions.chatgpt || "計測結果はまだありません。"}</p>
            </section>
            <section>
              <h3>Gemini</h3>
              <p>{dashboard.aio.mentions.gemini || "計測結果はまだありません。"}</p>
            </section>
            <section>
              <h3>Google AI</h3>
              <p>{dashboard.aio.mentions.googleAi || "計測結果はまだありません。"}</p>
            </section>
          </div>
        </article>
      </section>
    </main>
  );
}
