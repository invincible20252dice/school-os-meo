import { buildDifferentiationData } from "@/lib/mock/differentiationData";
import styles from "./page.module.css";

function PostIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M6 3h12v18H6z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}

export default function ResultPostsPage() {
  const data = buildDifferentiationData();
  const input = data.resultPost?.input;
  const preview = data.resultPost?.preview;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Results Multi Post</p>
        <h1>成績UP・合格実績 投稿作成</h1>
        <p>簡単な成果情報から、GBP・Instagram・LINE向けの投稿文を一括生成します。</p>
      </header>

      <section className={styles.grid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <PostIcon />
            <div>
              <h2>成果入力</h2>
              <p>塾長が入力する最低限の情報です。</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label>
              <span>学年</span>
              <input value={input?.grade ?? ""} readOnly />
            </label>
            <label>
              <span>学校名</span>
              <input value={input?.schoolName ?? ""} readOnly />
            </label>
            <label>
              <span>成果</span>
              <input value={input?.result ?? ""} readOnly />
            </label>
            <label>
              <span>科目</span>
              <input value={input?.subject ?? ""} readOnly />
            </label>
            <label className={styles.full}>
              <span>補足コメント</span>
              <textarea rows={5} value={input?.comment ?? ""} readOnly />
            </label>
          </div>
          <div className={styles.actions}>
            <button type="button">一括予約投稿</button>
            <button type="button">即時投稿</button>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <PostIcon />
            <div>
              <h2>AI自動生成プレビュー</h2>
              <p>媒体別に文章と画像テキストを最適化します。</p>
            </div>
          </div>
          <div className={styles.previewList}>
            <section>
              <span>Googleビジネスプロフィール</span>
              <p>{preview?.gbp ?? ""}</p>
            </section>
            <section>
              <span>Instagram</span>
              <p>{preview?.instagram ?? ""}</p>
              <b>{preview?.imageText ?? ""}</b>
            </section>
            <section>
              <span>LINE公式アカウント</span>
              <p>{preview?.line ?? ""}</p>
            </section>
          </div>
        </article>
      </section>
    </main>
  );
}
