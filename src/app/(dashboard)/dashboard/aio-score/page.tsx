import { buildMockAioScoreDashboard } from "@/lib/aio-analyzer";
import { findDashboardSchoolName } from "@/lib/dashboard-school-name";
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

export default async function AioScorePage({
  searchParams,
}: {
  searchParams?: Promise<{ schoolId?: string }>;
}) {
  const params = await searchParams;
  const selectedSchoolName = await findDashboardSchoolName(
    prisma,
    params?.schoolId,
  );
  const dashboard = buildMockAioScoreDashboard();
  const schoolName = selectedSchoolName || dashboard.schoolName;

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
        <ScoreCard label="ChatGPT" score={dashboard.summary.chatgptScore} />
        <ScoreCard label="Gemini" score={dashboard.summary.geminiScore} />
        <ScoreCard
          label="Google AIモード"
          score={dashboard.summary.googleAiScore}
        />
        <article className={styles.totalCard}>
          <BrainIcon />
          <span>総合AIOスコア</span>
          <strong>{dashboard.summary.totalScore}%</strong>
          <small>{dashboard.checkedAt}</small>
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
              {dashboard.keywordRows.map((row) => (
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
            {dashboard.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <BrainIcon />
            <div>
              <h2>AI言及文脈</h2>
              <p>{schoolName} のMock分析での回答抜粋です。</p>
            </div>
          </div>
          <div className={styles.mentions}>
            <section>
              <h3>ChatGPT</h3>
              <p>{dashboard.mentions.chatgpt}</p>
            </section>
            <section>
              <h3>Gemini</h3>
              <p>{dashboard.mentions.gemini}</p>
            </section>
            <section>
              <h3>Google AI</h3>
              <p>{dashboard.mentions.googleAi}</p>
            </section>
          </div>
        </article>
      </section>
    </main>
  );
}
