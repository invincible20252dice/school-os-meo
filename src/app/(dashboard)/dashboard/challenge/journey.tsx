"use client";

import Link from "next/link";
import { missions, type ChallengeDocument, type Snapshot } from "@/lib/challenge";
import { dayGoals, dayTitle, deriveJourney } from "@/lib/challenge-journey";
import { challengeHref } from "./day-detail";
import styles from "./page.module.css";

export function Journey({ doc, snapshot, viewingDay, schoolId, onTask }: { doc: ChallengeDocument; snapshot: Snapshot; viewingDay: number; schoolId: string; onTask: (day: number, key: string) => void }) {
  const { currentDay, currentTask, dayCompletion, completed } = deriveJourney(doc, snapshot);
  const href = (day: number) => challengeHref(`/dashboard/challenge?day=${day}`, schoolId);
  return <>
    <nav className={styles.dayNav} aria-label="DAYナビゲーション">{missions.map(mission => {
      const cleared = doc.missions.find(m => m.day === mission.day)!.status === "COMPLETED";
      const today = currentDay?.day === mission.day;
      return <Link key={mission.day} href={href(mission.day)} aria-current={viewingDay === mission.day ? "page" : undefined} data-today={today} data-complete={cleared} aria-label={`DAY${mission.day} ${cleared ? "完了" : today ? "今日" : "内容を見る"}`}><span aria-hidden="true">{cleared ? "✓" : today ? "●" : "○"}</span><b>DAY{mission.day}</b><small>{cleared ? "完了" : today ? "今日" : ""}</small></Link>;
    })}</nav>
    {currentDay ? <section className={styles.today} aria-label="現在取り組むDAY">
      <p className={styles.dayNumber}>DAY {currentDay.day} / 7 <span>今日</span></p>
      <h2>{dayTitle(currentDay.day)}</h2>
      <p className={styles.goal}><strong>今日のゴール</strong>{dayGoals[currentDay.day - 1]}</p>
      <div className={styles.todayProgress}><strong>{dayCompletion.done} / {dayCompletion.total} <span>項目確認済み</span></strong><span>あと{dayCompletion.remaining}項目を確認</span><small>DAY全体の目安：約{missions[currentDay.day - 1].minutes}分</small></div>
      <progress aria-label="今日の確認項目" value={dayCompletion.done} max={dayCompletion.total} />
      <section className={styles.nextTask} aria-label="次にやること">
        <p className={styles.kicker}>NEXT ACTION</p>
        <h3>{currentTask ? `${currentTask.label}を確認しましょう` : "実行記録を確認して、DAYを完了にしましょう"}</h3>
        <p>{currentTask ? currentTask.reason : currentDay.day === 2 ? "写真の確認項目はそろっています。「DAY2を完了する」で保存してください。進捗状態の選択は不要です。" : "確認項目はそろっています。必要なメモを記入し、進捗状態を「完了」にして保存してください。保存時に完了条件を確認します。"}</p>
        <button type="button" className={styles.primary} onClick={() => onTask(currentDay.day, currentTask?.key ?? "status")}>{currentTask ? "今すぐ確認する" : "完了の記録へ"} →</button>
      </section>
    </section> : <section className={styles.today} aria-label="チャレンジ完了"><p className={styles.dayNumber}>7 / 7 DAY 完了</p><h2>7日間チャレンジの実行記録がそろいました</h2><p>これからは今週のアクションで改善を続けましょう。残課題や問い合わせの成果は、引き続き確認できます。</p><Link className={styles.primaryLink} href={challengeHref("/dashboard/challenge/weekly", schoolId)}>今週のアクションへ →</Link></section>}
    <p className={styles.muted}>7つのDAYのうち {completed} DAY完了</p>
  </>;
}
