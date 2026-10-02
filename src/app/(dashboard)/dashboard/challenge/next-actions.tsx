"use client";

import Link from "next/link";
import { useState } from "react";
import { statusLabels, type ChallengeDocument, type Snapshot } from "@/lib/challenge";
import { nextActions, type NextActionRecord } from "@/lib/challenge-next-actions";
import { formatMetric, priorityLabels } from "@/lib/challenge-progress";
import { challengeHref } from "./day-detail";
import styles from "./page.module.css";

type Save = (command: Record<string, unknown>) => Promise<void>;
function ActionRecord({ record, save, busy }: { record: NextActionRecord; save: Save; busy: boolean }) {
  const [note, setNote] = useState(record.note);
  const [status, setStatus] = useState(record.status);
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); void save({ action: "next-action", key: record.key, status, note }); }}>
    <h3>{record.title}</h3><p>{record.reason}</p><p>開始：{record.startedAt.slice(0, 10)} / {statusLabels[record.status]}</p>
    <fieldset disabled={busy}><label>実行結果・残課題<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label><label>アクションの状態<select value={status} onChange={e => setStatus(e.target.value as NextActionRecord["status"])}><option value="IN_PROGRESS">対応中</option><option value="WAITING">確認待ち</option><option value="DEFERRED">後で対応</option><option value="COMPLETED">完了（手動申告）</option></select></label><button>アクション記録を保存</button></fieldset>
  </form>;
}
export function ActionPanel({ doc, snapshot, schoolId, day, weekly = false, save, busy }: { doc: ChallengeDocument; snapshot: Snapshot; schoolId: string; day?: number; weekly?: boolean; save: Save; busy: boolean }) {
  const plan = nextActions(doc, snapshot);
  const selected = day ? plan.days[day - 1] : null;
  const actions = selected ? selected.actions : weekly ? plan.days.flatMap(d => d.actions) : plan.top ? [plan.top] : [];
  const active = selected ? selected.active : plan.active;
  return <section className={styles.section} aria-label="校舎別NEXT ACTION"><h2>{weekly ? "今週の優先アクション" : day ? "この校舎で優先する改善" : "今日のNEXT ACTION"}</h2>
    {actions.length ? <ol className={styles.checklist}>{actions.map(action => <li className={styles.checkItem} key={action.key}><p className={styles.kicker}>DAY{action.day} / {priorityLabels[action.priority]} / 約{action.minutes}分</p><h3>{action.title}</h3><p>{action.reason}</p><small>判定根拠：{action.source}</small><div className={styles.links}><Link href={challengeHref(action.path, schoolId)}>関連機能を開く →</Link><button disabled={busy} onClick={() => void save({ action: "next-action", key: action.key, status: "IN_PROGRESS", note: "" })}>この改善を開始する</button></div></li>)}</ol> : <p>新しい優先提案はありません。対応中の記録や確認項目を見直し、次のDAYへ進めます。</p>}
    {(day === 3 || weekly) ? <div className={styles.facts}><h3>口コミ依頼の目標</h3><p>{doc.requestTarget?.reason ?? plan.request.reason}</p><p>保存済みの実行目標：{doc.requestTarget?.count ?? 10}名</p>{!doc.requestTarget && doc.missions[2].status === "NOT_STARTED" && plan.request.count !== null ? <button disabled={busy} onClick={() => void save({ action: "adopt-request-target" })}>提案の{plan.request.count}名をDAY3目標に適用</button> : null}</div> : null}
    {(day === 4 || weekly) ? <div className={styles.facts}><h3>追加依頼の目標</h3><p>{doc.additionalRequestTarget?.reason ?? plan.additionalRequest.reason}</p><p>保存済みの追加目標：{doc.additionalTarget}名</p>{!doc.additionalRequestTarget && doc.missions[3].status === "NOT_STARTED" && plan.additionalRequest.count !== null ? <button disabled={busy} onClick={() => void save({ action: "adopt-request-target", day: 4 })}>提案の{plan.additionalRequest.count}名をDAY4目標に適用</button> : null}</div> : null}
    {day === 5 ? <p className={styles.warning}>投稿テーマの選択・下書きだけでは公開完了になりません。Googleでの公開を確認し、DAY5の実行記録へURL・日時を保存してください。Instagram連携がある場合は既存の同期画面を利用できます。</p> : null}
    {active.length ? <><h3>対応中・残課題</h3>{active.map(record => <ActionRecord key={`${record.key}-${record.updatedAt}`} record={record} save={save} busy={busy} />)}</> : null}
    <details className={styles.details}><summary>提案・対応履歴 {plan.history.length}件</summary>{plan.history.map((record, i) => <p key={i}>DAY{record.day} {record.title} / {statusLabels[record.status]} / 提案 {record.proposedAt.slice(0, 10)} / {record.completedAt ? `完了 ${record.completedAt.slice(0, 10)}` : "未完了"} / {record.note}</p>)}</details>
  </section>;
}
export function ChallengeGoal({ doc, snapshot }: { doc: ChallengeDocument; snapshot: Snapshot }) {
  const days = Math.max(1, Math.floor((Date.parse(snapshot.at) - Date.parse(doc.startedAt)) / 86400000) + 1);
  const count = doc.inquiries?.google;
  const history = doc.nextActionHistory ?? [];
  return <section className={styles.progress} aria-label="成果目標"><h2>{count !== undefined && count >= 1 ? "成果目標達成" : "Google経由の新規問い合わせ1件を目指す"}</h2><p>目標：1件 / 実績：{formatMetric(count)}（手動申告・テスト除外）</p><p>開始から{days}日目 / 同じ日に複数DAYへ進めます。</p>
    {doc.completedAt ? <><h3>7つのミッションの振り返り</h3><p>保存した提案：{history.length}件 / 完了した改善：{history.filter(r => r.status === "COMPLETED").length}件 / 対応中・残課題：{history.filter(r => r.status !== "COMPLETED").length}件</p><p>口コミ：{formatMetric(doc.baseline.reviews?.count)} → {formatMetric(snapshot.reviews?.count)} / 返信記録率：{formatMetric(doc.baseline.reviews?.replyRate, "%")} → {formatMetric(snapshot.reviews?.replyRate, "%")}</p><p>成果は施策だけの効果と断定せず、今週のアクションで継続して確認しましょう。</p></> : null}
  </section>;
}
