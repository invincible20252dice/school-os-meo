import { buildAiReviewReplyDemo } from "@/lib/ai-review-demo";
import {
  buildMeoExtendedData,
  buildReviewTrendPath,
} from "@/lib/mock/meoExtendedData";
import TestReviewNotificationButton from "@/components/dashboard/TestReviewNotificationButton";
import styles from "./page.module.css";

function MessageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.2A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
      <path d="M18.5 15l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7z" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 5.8C4 3.7 5.8 2 8 2h8c2.2 0 4 1.7 4 3.8v5.7c0 2.1-1.8 3.8-4 3.8h-2.7L8.2 21v-5.7H8c-2.2 0-4-1.7-4-3.8V5.8z" />
      <path d="M8 7.5v4" />
      <path d="M11 11.5v-4l2.5 4v-4" />
      <path d="M17 7.5h-2v4h2" />
      <path d="M15 9.5h1.6" />
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

export default function ReviewsPage() {
  const demo = buildAiReviewReplyDemo();
  const extended = buildMeoExtendedData();
  const reviewTrendPath = buildReviewTrendPath(extended.reviewTrends);
  const lineJson = JSON.stringify(demo.lineNotification, null, 2);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>AI Review Reply</p>
        <h1>AI口コミ返信とLINE通知の見え方</h1>
        <p>
          Google口コミを受信したあと、AI返信案が作成され、管理用LINEに通知される状態を確認できます。
        </p>
        <TestReviewNotificationButton />
      </header>

      <section className={styles.flowGrid}>
        {demo.timeline.map((item, index) => (
          <article
            key={item.label}
            className={item.done ? styles.flowDone : styles.flowPending}
          >
            <span>{index + 1}</span>
            <strong>{item.label}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <MessageIcon />
            <div>
              <h2>受信したGoogle口コミ</h2>
              <p>{demo.review.reviewedAt}</p>
            </div>
          </div>
          <div className={styles.reviewMeta}>
            <strong>{demo.review.schoolName}</strong>
            <span>{demo.review.stars}</span>
          </div>
          <p className={styles.reviewer}>{demo.review.reviewerName}</p>
          <p className={styles.reviewText}>{demo.review.reviewText}</p>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelTitle}>
            <SparkIcon />
            <div>
              <h2>AI返信案</h2>
              <p>Review.status: {demo.savedReview.status}</p>
            </div>
          </div>
          <p className={styles.replyText}>{demo.aiReplyText}</p>
          <dl className={styles.savedState}>
            <div>
              <dt>保存ID</dt>
              <dd>{demo.savedReview.id}</dd>
            </div>
            <div>
              <dt>生成時刻</dt>
              <dd>{demo.savedReview.aiReplyGeneratedAt}</dd>
            </div>
            <div>
              <dt>通知時刻</dt>
              <dd>{demo.savedReview.lineNotifiedAt}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className={styles.trendPanel}>
        <div className={styles.panelTitle}>
          <TrendIcon />
          <div>
            <h2>口コミ件数＆評価推移</h2>
            <p>過去1年以上の口コミ件数と平均評価の時系列推移です。</p>
          </div>
        </div>
        <div className={styles.trendGrid}>
          <div className={styles.lineChart}>
            <svg viewBox="0 0 320 160" role="img" aria-label="口コミ件数推移グラフ">
              <path d="M0 140H320" />
              <path d="M0 100H320" />
              <path d="M0 60H320" />
              <path d={reviewTrendPath} className={styles.reviewLine} />
              {extended.reviewTrends?.map((point, index) => {
                const x =
                  extended.reviewTrends.length === 1
                    ? 160
                    : (index / (extended.reviewTrends.length - 1)) * 320;
                const max = Math.max(
                  ...extended.reviewTrends.map((item) => item?.reviewCount ?? 0),
                  1,
                );
                const y = 140 - ((point?.reviewCount ?? 0) / max) * 140;

                return (
                  <g key={point?.month}>
                    <title>
                      {`${point?.month}: ${point?.reviewCount}件 / 平均★${point?.averageRating}`}
                    </title>
                    <circle cx={x} cy={y} r="4" />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className={styles.trendList}>
            {extended.reviewTrends?.slice(-4).map((point) => (
              <div key={point?.month}>
                <span>{point?.month}</span>
                <strong>{point?.reviewCount}件</strong>
                <b>★{point?.averageRating}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.linePanel}>
        <div className={styles.panelTitle}>
          <LineIcon />
          <div>
            <h2>LINE通知プレビュー</h2>
            <p>実際にはLINE Flex Messageとして送信されます。</p>
          </div>
        </div>
        <div className={styles.linePreview}>
          <div className={styles.lineBubble}>
            <strong>新着Google口コミ</strong>
            <span>{demo.review.schoolName}</span>
            <b>{demo.review.stars}</b>
            <p>口コミ: {demo.review.reviewText}</p>
            <p>AI返信案: {demo.aiReplyText}</p>
            <button type="button">返信を確認する</button>
          </div>
          <pre>{lineJson}</pre>
        </div>
      </section>
    </main>
  );
}
