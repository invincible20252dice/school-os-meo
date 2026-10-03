"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { missions, type ChallengeDocument, type Snapshot } from "@/lib/challenge";
import { challengeProgress, checkLabels, dayProgress, fieldProgress, formatMetric, metricChange, priorityLabels, type DayProgress, type ProgressItem } from "@/lib/challenge-progress";
import styles from "./page.module.css";
import { dayChecks, dayTitle } from "@/lib/challenge-journey";

export function challengeHref(path: string, schoolId: string) {
  return `${path}${path.includes("?") ? "&" : "?"}schoolId=${encodeURIComponent(schoolId)}`;
}
export function ProgressMeter({ progress, label }: { progress: Pick<DayProgress, "percent" | "done" | "total" | "unit" | "remaining">; label: string }) {
  return <div className={styles.meter}><span>{label}</span><strong>{progress.percent}%</strong><progress aria-label={label} value={progress.percent} max={100} /><p>{progress.done} / {progress.total}{progress.unit} <span className={styles.muted}>{progress.remaining ? `あと${progress.remaining}${progress.unit}` : "目標数に到達"}</span></p></div>;
}
export function DayCards({ doc, snapshot, schoolId, compact = false }: { doc: ChallengeDocument | null; snapshot: Snapshot; schoolId: string; compact?: boolean }) {
  return <section className={styles.grid} aria-label="7つのミッション">{missions.map(mission => {
    const saved = doc?.missions.find(m => m.day === mission.day);
    const progress = saved && doc ? dayProgress(saved, doc.additionalTarget, snapshot, doc.requestTarget?.count) : null;
    if (compact) {
      const current = doc?.missions.find(m => m.status !== "COMPLETED")?.day === mission.day;
      const checks = saved && doc ? dayChecks(doc, saved, snapshot) : [];
      const done = checks.filter(c => c.state === "GOOD").length;
      return <article className={styles.card} key={mission.day}><span className={styles.kicker}>DAY{mission.day}</span><h2>{dayTitle(mission.day)}</h2>
        <span className={styles.badge}>{progress?.cleared ? "✓ 完了" : current ? "今日" : saved?.status === "DEFERRED" ? "あとで対応あり" : saved?.status === "WAITING" ? "確認待ち" : saved?.status === "IN_PROGRESS" ? "対応中" : "未着手"}</span>
        {checks.length > 0 ? <p>{done} / {checks.length} 項目確認済み{done < checks.length ? <small> / あと{checks.length - done}項目を確認</small> : null}</p> : null}
        <small>約{mission.minutes}分</small><Link href={doc ? challengeHref(`/dashboard/challenge?day=${mission.day}`, schoolId) : "#challenge-start"}>{progress?.cleared ? "達成内容を見る" : current ? "続きから" : "内容を見る"} →</Link></article>;
    }
    return <article className={styles.card} key={mission.day}>
      <span className={styles.kicker}>DAY{mission.day}</span><h2>{mission.title}</h2>
      <span className={styles.badge}>{progress?.cleared ? "CLEAR" : saved?.status === "WAITING" ? "確認待ち" : saved?.status === "DEFERRED" ? "あとで対応" : saved && saved.status !== "NOT_STARTED" ? "進行中" : "未着手"}</span>
      {progress ? <><ProgressMeter progress={progress} label={`DAY${mission.day}達成率`} />{progress.cleared && progress.incomplete.length ? <small>あとで対応あり：{progress.incomplete.length}項目</small> : null}{mission.day === 4 ? <small>口コミ対応：{progress.items[1].state === "GOOD" ? "記録済み" : "確認が必要"}</small> : null}</> : <p>開始後に進捗を記録</p>}
      <small>約{mission.minutes}分</small><Link href={doc ? challengeHref(`/dashboard/challenge?day=${mission.day}`, schoolId) : "#challenge-start"}>{progress?.cleared ? "達成内容を見る" : progress && progress.percent > 0 ? "続きをやる" : "始める"} →</Link>
    </article>;
  })}</section>;
}
function ChecklistItem({ item, schoolId }: { item: ProgressItem; schoolId: string }) {
  return <li className={styles.checkItem}><div><strong>{item.label}</strong><span className={styles.badge} data-state={item.state}>{item.deferred ? "あとで対応" : checkLabels[item.state]}</span><small>{priorityLabels[item.priority]}</small></div><p>現在の記録：{item.value}</p><p className={styles.muted}>{item.reason}</p><Link href={challengeHref(item.path, schoolId)}>{item.cta} →</Link><a href="#execution-record">実行記録へ</a></li>;
}
export function RecommendedActions({ progress, schoolId }: { progress: DayProgress; schoolId: string }) {
  return <section className={styles.section} aria-label="今日やること"><h3>今日やること</h3>{progress.recommended.length ? <><p>未達 {progress.incomplete.length}項目 / 優先順に最大3件</p><ol className={styles.checklist}>{progress.recommended.map(item => <ChecklistItem key={item.key} item={item} schoolId={schoolId} />)}</ol></> : <p>{progress.cleared ? "このDAYの実行記録は完了しています。次のミッションへ進めます。" : "確認項目はそろっています。実行記録を保存してDAYの完了を確認してください。"}</p>}</section>;
}
function ComparisonMetric({ label, before, current, unit = "件" }: { label: string; before: number | null | undefined; current: number | null | undefined; unit?: string }) {
  return <div><dt>{label}</dt><dd>{formatMetric(before, unit)} → {formatMetric(current, unit)} <small>{metricChange(before, current, unit === "%" ? "pt" : unit)}</small></dd></div>;
}
export function OutcomeMetrics({ day, doc, snapshot }: { day: number; doc: ChallengeDocument; snapshot: Snapshot }) {
  return <section className={styles.section} aria-label="現在の成果"><h3>現在の成果</h3><p className={styles.muted}>期間：{doc.startedAt.slice(0, 10)} ～ {snapshot.at.slice(0, 10)} / DB保存分・手動記録。行動との因果関係は断定しません。</p><dl className={styles.outcomes}>
    {day === 1 || day === 7 ? <div><dt>Google集客・問い合わせ導線スコア</dt><dd>未計測（自動診断なし）</dd></div> : null}
    {day === 2 ? <><div><dt>写真追加枚数</dt><dd>未計測（カテゴリ確認と枚数は別指標）</dd></div><div><dt>充足・対象外の確認記録</dt><dd>{dayProgress(doc.missions[1], doc.additionalTarget, snapshot).done} / {missions[1].fields.length}カテゴリ</dd></div></> : null}
    {day === 3 || day === 4 ? <><div><dt>期間内のアンケート回答</dt><dd>{formatMetric(snapshot.surveyResponses)}</dd></div><div><dt>新規Google口コミ（投稿日基準）</dt><dd>{formatMetric(snapshot.reviews?.newCount)}</dd></div><div><dt>回答率・口コミ転換率</dt><dd>未計測（依頼対象者との対応付けなし）</dd></div><ComparisonMetric label="保存済み口コミ数" before={doc.baseline.reviews?.count} current={snapshot.reviews?.count} /></> : null}
    {day === 4 || day === 6 || day === 7 ? <ComparisonMetric label="返信記録率" before={doc.baseline.reviews?.replyRate} current={snapshot.reviews?.replyRate} unit="%" /> : null}
    {day === 4 ? <div><dt>DB内の未対応口コミ</dt><dd>{formatMetric(snapshot.reviews?.pending)}</dd></div> : null}
    {day === 5 ? <><ComparisonMetric label="同期投稿記録" before={doc.baseline.posts?.count} current={snapshot.posts?.count} /><div><dt>最終同期投稿</dt><dd>{snapshot.posts ? snapshot.posts.latestAt ? snapshot.posts.latestAt.slice(0, 10) : "保存記録なし" : "取得失敗"}</dd></div></> : null}
    {day === 6 ? <div><dt>競合計測</dt><dd>{snapshot.comparisons === null ? "取得失敗" : snapshot.comparisons.length ? `${snapshot.comparisons.length}件の保存済み計測を参照可能` : "保存記録なし"}</dd></div> : null}
    {day === 7 ? <div><dt>Google経由の実問い合わせ（手動申告）</dt><dd>{formatMetric(doc.inquiries?.google)}</dd></div> : null}
  </dl></section>;
}
export function DiagnosticDetails({ doc }: { doc: ChallengeDocument }) {
  return <details className={styles.details}><summary>確認項目の詳細を見る</summary><p>現在のミッション定義と保存済み手動記録です。自動診断スコアではありません。</p><div className={styles.tableScroll}><table><thead><tr><th>DAY</th><th>確認項目</th><th>現在の記録</th><th>状態</th><th>重要度</th><th>判定方式</th></tr></thead><tbody>{missions.flatMap(m => m.fields.map(field => {
    const item = fieldProgress(field, doc.missions[m.day - 1]);
    return <tr key={`${m.day}-${field.key}`}><td>{m.day}</td><td>{field.label}</td><td>{item.value}</td><td>{item.deferred ? "あとで対応" : item.state === "GOOD" ? "記録済み" : checkLabels[item.state]}</td><td>{item.priority}</td><td>手動記録</td></tr>;
  }))}</tbody></table></div></details>;
}
export function DayDetail({ day, doc, snapshot, schoolId, children, actionsProvided = false, compact = false }: { day: number; doc: ChallengeDocument; snapshot: Snapshot; schoolId: string; children: ReactNode; actionsProvided?: boolean; compact?: boolean }) {
  const mission = missions[day - 1];
  const progress = dayProgress(doc.missions[day - 1], doc.additionalTarget, snapshot, doc.requestTarget?.count);
  if (compact) return <section className={styles.dayDetail} aria-label={`DAY${day}詳細`}>
    <header><p className={styles.kicker}>閲覧中：DAY{day}</p><h2>{dayTitle(day)}</h2></header>
    {progress.cleared ? <div className={styles.notice}><h3>✓ DAY{day} 完了</h3><p>完了の実行記録を保存済みです。残課題は別に確認できます。</p></div> : null}
    {children}
    <details className={styles.details}><summary>このDAYの成果・達成率を見る</summary><ProgressMeter progress={progress} label={`DAY${day} ミッション達成率`} /><p>項目の達成率とDAYの完了記録は別です。</p><OutcomeMetrics day={day} doc={doc} snapshot={snapshot} /></details>
    <nav className={styles.links}>{day < 7 ? <Link href={challengeHref(`/dashboard/challenge?day=${day + 1}`, schoolId)}>次のDAY{day + 1}を見る →</Link> : <Link href={challengeHref("/dashboard/challenge/weekly", schoolId)}>今週のアクションへ →</Link>}</nav>
    <DiagnosticDetails doc={doc} />
  </section>;
  return <section className={styles.dayDetail} aria-label={`DAY${day}詳細`}>
    <header><p className={styles.kicker}>DAY{day} / 7</p><h2>{mission.title}</h2><p>{mission.criterion}</p><small>所要時間：約{mission.minutes}分 / 手動の実行記録</small></header>
    <ProgressMeter progress={progress} label={`DAY${day} ミッション達成率`} />
    <p className={styles.muted}>達成 {progress.complete.length} / 要改善・要対応 {progress.incomplete.filter(i => i.state === "WARNING" || i.state === "ERROR").length} / 未確認 {progress.incomplete.filter(i => i.state === "UNCHECKED").length}</p>
    {progress.cleared ? <div className={styles.notice}><h3>DAY{day} CLEAR</h3><p>実行記録の完了を保存済みです。現在の未達項目は、完了履歴とは別に保持します。</p></div> : null}
    <div className={styles.dayColumns}><div>{!actionsProvided ? <RecommendedActions progress={progress} schoolId={schoolId} /> : null}<section className={styles.section}><h3>未達項目一覧</h3>{progress.incomplete.length ? <ul className={styles.checklist}>{progress.incomplete.map(item => <li key={item.key}><strong>{item.label}</strong>：{item.deferred ? "あとで対応" : checkLabels[item.state]} / {priorityLabels[item.priority]}</li>)}</ul> : <p>未達項目はありません。</p>}</section><details className={styles.details}><summary>達成済み {progress.complete.length}項目</summary><ul className={styles.checklist}>{progress.complete.map(item => <ChecklistItem key={item.key} item={item} schoolId={schoolId} />)}</ul></details></div><OutcomeMetrics day={day} doc={doc} snapshot={snapshot} /></div>
    {children}
    {!progress.cleared ? <p>DAY{day}はまだCLEARしていません。未対応項目は{progress.incomplete.length}件です。次のDAYへ進んでも完了扱いにはなりません。</p> : null}
    <nav className={styles.links}>{day < 7 ? <Link href={challengeHref(`/dashboard/challenge?day=${day + 1}`, schoolId)}>{progress.cleared ? "" : "それでも"}DAY{day + 1}へ進む →</Link> : <Link href={challengeHref("/dashboard/challenge/weekly", schoolId)}>今週のアクションへ →</Link>}</nav>
    <DiagnosticDetails doc={doc} />
  </section>;
}
export function OverallProgress({ doc, snapshot, schoolId }: { doc: ChallengeDocument; snapshot: Snapshot; schoolId: string }) {
  const progress = challengeProgress(doc, snapshot);
  const next = progress.recommended;
  return <section className={styles.progress}><h2>全体達成率</h2><strong className={styles.overallNumber}>{progress.percent}%</strong><progress aria-label="全体達成率" value={progress.percent} max={100} /><p>{progress.cleared} / 7 DAY CLEAR</p><small>各DAY達成率の平均 / 項目は重要度S=10・A=5・B=3・C=1で加重</small>
    {next ? <div className={styles.recommendation}><h3>今日のおすすめ</h3><p>DAY{next.day}：{next.recommended[0]?.label ?? "実行記録を保存して完了を確認"}</p><Link href={challengeHref(`/dashboard/challenge?day=${next.day}`, schoolId)}>今すぐ確認 →</Link><small>約{missions[next.day - 1].minutes}分</small></div> : null}
  </section>;
}
