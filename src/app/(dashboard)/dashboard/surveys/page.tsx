import Link from "next/link";
import { buildMockSurveyEditorState } from "@/lib/survey-builder";
import styles from "./page.module.css";

export default function SurveysPage() {
  const survey = buildMockSurveyEditorState();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Surveys</p>
        <h1>アンケート設定一覧</h1>
        <p>口コミ生成に使うアンケートと設問を管理します。</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{survey.title}</h2>
            <p>{survey.requiredKeywords}</p>
          </div>
          <Link href={`/dashboard/surveys/${survey.id}/edit`}>編集</Link>
        </div>
        <dl className={styles.meta}>
          <div>
            <dt>設問数</dt>
            <dd>{survey.items.length}</dd>
          </div>
          <div>
            <dt>文字数</dt>
            <dd>
              {survey.minCharCount}〜{survey.maxCharCount}
            </dd>
          </div>
          <div>
            <dt>状態</dt>
            <dd>{survey.isValid ? "有効" : "停止中"}</dd>
          </div>
          <div>
            <dt>特典</dt>
            <dd>{survey.benefitType}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
