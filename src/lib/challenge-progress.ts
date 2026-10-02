import { missions, type ChallengeDocument, type Field, type MissionProgress, type Priority, type Snapshot } from "./challenge";

export const priorityWeights: Record<Priority, number> = { S: 10, A: 5, B: 3, C: 1 };
export const priorityLabels: Record<Priority, string> = { S: "最優先", A: "重要", B: "推奨", C: "改善候補" };
export type CheckState = "GOOD" | "WARNING" | "ERROR" | "UNCHECKED";
export const checkLabels: Record<CheckState, string> = { GOOD: "達成", WARNING: "要改善", ERROR: "要対応", UNCHECKED: "未確認" };
export type ProgressItem = { key: string; label: string; priority: Priority; state: CheckState; value: string; reason: string; path: string; cta: string; deferred: boolean };
export type DayProgress = { day: number; percent: number; done: number; total: number; unit: string; remaining: number; cleared: boolean; items: ProgressItem[]; incomplete: ProgressItem[]; complete: ProgressItem[]; recommended: ProgressItem[] };

const priorities = (a: ProgressItem, b: ProgressItem) => priorityWeights[b.priority] - priorityWeights[a.priority] || ({ ERROR: 0, WARNING: 1, UNCHECKED: 2, GOOD: 3 }[a.state] - { ERROR: 0, WARNING: 1, UNCHECKED: 2, GOOD: 3 }[b.state]);
export function fieldProgress(field: Field, progress: MissionProgress): ProgressItem {
  const value = String(progress.evidence[field.key] ?? "").trim();
  const deferred = value === "後で対応";
  const state: CheckState = value === "要改善" ? "WARNING" : !value || deferred ? "UNCHECKED" : "GOOD";
  return { key: field.key, label: field.label, priority: field.priority ?? "B", state, value: value || "未記録", deferred,
    reason: deferred ? "後日対応として残っています。確認・改善後に記録を更新してください。" : state === "WARNING" ? "要改善の申告があります。関連設定を見直してください。" : state === "UNCHECKED" ? "まだ確認記録がありません。実際の状態を確認してください。" : "実行記録を保存済みです。",
    path: missions[progress.day - 1].links[0].path, cta: progress.day === 2 ? "写真・店舗設定を確認" : "設定・関連画面を開く" };
}
export function dayProgress(progress: MissionProgress, additionalTarget: number, snapshot: Snapshot): DayProgress {
  const mission = missions[progress.day - 1];
  let items = mission.fields.map(f => fieldProgress(f, progress));
  let total = items.length;
  let done = items.filter(i => i.state === "GOOD").length;
  let unit = "項目";
  let percent = Math.round(items.reduce((sum, i) => sum + (i.state === "GOOD" ? priorityWeights[i.priority] : 0), 0) / items.reduce((sum, i) => sum + priorityWeights[i.priority], 0) * 100);
  if (progress.day === 3 || progress.day === 4) {
    total = progress.day === 3 ? 10 : additionalTarget;
    done = typeof progress.evidence.requested === "number" ? progress.evidence.requested : 0;
    unit = "名";
    const fraction = Math.min(done / total, 1);
    items[0] = { ...items[0], state: done >= total ? "GOOD" : "WARNING", value: `${done} / ${total}名`, reason: done >= total ? "依頼人数の目標を達成しました。" : `あと${total - done}名へ、評価で選別せず率直なご意見を依頼しましょう。`, path: "/dashboard/surveys", cta: "口コミ依頼をする" };
    percent = Math.round(fraction * 100);
    if (progress.day === 4) {
      const response = progress.evidence.reviews;
      const handled = response === "対応済み" || response === "対象なし" && snapshot.reviews?.pending === 0;
      items[1] = { ...items[1], state: handled ? "GOOD" : snapshot.reviews && snapshot.reviews.pending > 0 ? "WARNING" : "UNCHECKED", value: snapshot.reviews ? `未対応 ${snapshot.reviews.pending}件 / ${items[1].value}` : "口コミデータ未取得", reason: handled ? "対象口コミへの対応を記録済みです。" : "未対応口コミを確認し、返信または対象なしの実行記録を残してください。", path: "/dashboard/reviews", cta: "口コミに返信する" };
      percent = Math.round((fraction + Number(handled)) / 2 * 100);
    }
  } else if (progress.day === 5 || progress.day === 6) {
    total = 1;
    done = Number(items.every(i => i.state === "GOOD"));
    unit = progress.day === 5 ? "投稿" : "改善";
    percent = done * 100;
    items = [{ ...items[0], key: "execution", label: progress.day === 5 ? "Google投稿の公開確認" : "競合分析から1つ改善", state: done ? "GOOD" : "UNCHECKED", value: `${done} / 1${unit}`, reason: progress.day === 5 ? "Google側で公開を確認し、公開URLまたは投稿名・日時を記録してください。" : "保存済み計測から改善を選び、実行前後の状態を記録してください。", cta: progress.day === 5 ? "投稿を作成・確認" : "競合分析を見る", path: progress.day === 5 ? "/dashboard/posts/results" : "/dashboard/rankings" }];
  }
  const incomplete = items.filter(i => i.state !== "GOOD").sort(priorities);
  return { day: progress.day, percent, done, total, unit, remaining: Math.max(total - done, 0), cleared: progress.status === "COMPLETED", items, incomplete, complete: items.filter(i => i.state === "GOOD"), recommended: incomplete.slice(0, 3) };
}
export function challengeProgress(doc: ChallengeDocument, snapshot: Snapshot) {
  const days = doc.missions.map(m => dayProgress(m, doc.additionalTarget, snapshot));
  const recommended = days.find(d => !d.cleared) ?? days.find(d => d.incomplete.length > 0);
  return { days, percent: Math.round(days.reduce((sum, d) => sum + d.percent, 0) / days.length), cleared: days.filter(d => d.cleared).length, recommended };
}
export function formatMetric(value: number | null | undefined, unit = "件") {
  return value == null ? "未計測" : `${Math.round(value * 10) / 10}${unit}`;
}
export function metricChange(before: number | null | undefined, now: number | null | undefined, unit = "件") {
  if (before == null) return "開始時データなし";
  if (now == null) return "現在は未計測";
  const diff = Math.round((now - before) * 10) / 10;
  return `${diff > 0 ? "+" : ""}${diff}${unit}`;
}
