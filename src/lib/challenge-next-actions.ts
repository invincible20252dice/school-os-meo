import { ChallengeError, missions, text, type ChallengeDocument, type Priority, type Snapshot } from "./challenge";
import { fieldProgress, priorityWeights } from "./challenge-progress";
import { postTopics } from "./action-guides";

export type NextAction = {
  key: string; day: number; title: string; reason: string; priority: Priority;
  minutes: number; path: string; source: "保存済みデータ" | "手動確認" | "手動テーマ";
};
export type NextActionRecord = NextAction & {
  proposedAt: string; startedAt: string; updatedAt: string; completedAt: string | null;
  status: "IN_PROGRESS" | "WAITING" | "DEFERRED" | "COMPLETED";
  note: string; actorId: string;
};
const dayMs = 86400000;
const elapsed = (at: string, now: string) => (Date.parse(now) - Date.parse(at)) / dayMs;

export type ActionHistory = {
  missions: Array<{ day: number; completedAt: string | null }>;
  nextActionHistory?: Array<Pick<NextActionRecord, "key" | "day" | "status" | "completedAt">>;
};
export function availableActionCandidates<T extends NextAction>(candidates: T[], doc: ActionHistory, now: string): T[] {
  const history = doc.nextActionHistory ?? [];
  const latest = new Map(history.map(record => [record.key, record]));
  const recentMission = (day: number) => {
    const at = doc.missions[day - 1].completedAt;
    return at !== null && elapsed(at, now) < 7;
  };
  return candidates.filter(a => {
    const record = latest.get(a.key);
    if (record && (record.status !== "COMPLETED" || elapsed(record.completedAt!, now) < 7)) return false;
    if (a.key === "request-reviews" && (recentMission(3) || recentMission(4))) return false;
    if (a.day === 5 && recentMission(5) || a.key === "competitor-improvement" && recentMission(6)) return false;
    if (a.day === 5 && history.some(r => r.day === 5 && r.status === "COMPLETED" && elapsed(r.completedAt!, now) < 7)) return false;
    return true;
  }).sort((a, b) => priorityWeights[b.priority] - priorityWeights[a.priority] || a.day - b.day || a.key.localeCompare(b.key));
}

export function reviewRequestRecommendation(snapshot: Snapshot): { count: number | null; reason: string } {
  if (!snapshot.reviews) return { count: null, reason: "口コミデータを取得できないため、依頼人数は未判定です。" };
  // One latest measurement avoids counting the same competitor across keywords.
  const latest = snapshot.comparisons?.toSorted((a, b) => b.at.localeCompare(a.at))[0];
  const counts = latest?.competitors.flatMap(c => c.reviewCount !== null && c.reviewCount >= 0 ? [c.reviewCount] : []).sort((a, b) => a - b) ?? [];
  const middle = Math.floor(counts.length / 2);
  const median = counts.length ? counts.length % 2 ? counts[middle] : (counts[middle - 1] + counts[middle]) / 2 : null;
  const gap = median === null ? null : median - snapshot.reviews.count;
  if (gap !== null && gap >= 10) return { count: 10, reason: `保存済み口コミ${snapshot.reviews.count}件に対し、直近計測の競合中央値は${median}件（差${gap}件）。まず10名に率直なお声を依頼しましょう。` };
  if (gap !== null && gap > 0) return { count: 5, reason: `直近計測の競合中央値${median}件との差は${gap}件です。まず5名に依頼しましょう。` };
  if (snapshot.latestReviewAt && elapsed(snapshot.latestReviewAt, snapshot.at) >= 30) return { count: 5, reason: `保存済み口コミの最新投稿日は${snapshot.latestReviewAt.slice(0, 10)}です。30日以上経過しているため5名への依頼を提案します。` };
  if (gap !== null && snapshot.latestReviewAt) return { count: 0, reason: "保存済み口コミ数は直近計測の競合中央値以上で、30日以内の口コミもあります。追加依頼より他の改善を優先します。" };
  return { count: null, reason: "競合の口コミ数または最新投稿日が未計測です。人数を自動判定せず、保存済み計測を確認してください。" };
}

export function nextActions(doc: ChallengeDocument, snapshot: Snapshot) {
  const candidates: NextAction[] = [];
  const add = (key: string, day: number, title: string, reason: string, path: string, priority: Priority = "A", source: NextAction["source"] = "保存済みデータ") => {
    candidates.push({ key, day, title, reason, path, priority, source, minutes: missions[day - 1].minutes });
  };
  if (snapshot.google === false) add("google-connect", 1, "Googleアカウントを連携する", "保存済み設定でGoogle連携が未完了です。", "/dashboard/settings/google", "S");
  for (const day of [1, 2, 7]) {
    for (const field of missions[day - 1].fields) {
      const item = fieldProgress(field, doc.missions[day - 1]);
      if (item.state !== "GOOD") add(`check-${day}-${field.key}`, day, `${field.label}を確認・改善する`, item.reason, item.path, item.priority, "手動確認");
    }
  }
  const request = reviewRequestRecommendation(snapshot);
  const day3 = doc.missions[2];
  const requestDay = day3.status === "COMPLETED" ? 4 : 3;
  if (request.count !== null && request.count > 0) add("request-reviews", requestDay, `保護者${request.count}名へ率直なお声を依頼する`, request.reason, "/dashboard/surveys");
  if (request.count === null) add("review-measurement", requestDay, "口コミ・競合の保存データを確認する", request.reason, "/dashboard/rankings", "B");
  if (snapshot.reviews && snapshot.reviews.pending > 0) add("pending-replies", 4, `未対応口コミ${snapshot.reviews.pending}件に返信する`, "保存済み口コミに未対応の記録があります。依頼を増やす前に、届いた声へ対応しましょう。", "/dashboard/reviews", "S");
  const demand = snapshot.demand;
  const themes = demand?.filter(d => d.impressions > 0).slice(0, 3) ?? [];
  for (const theme of themes) add(`publish-${theme.query}`, 5, `${theme.query}に応える投稿を作る`, `${theme.month}の保存済み検索表示${theme.impressions}回。保護者が知りたい教室情報を、この検索テーマに沿って整理しましょう。`, snapshot.instagram ? "/dashboard/instagram" : "/dashboard/settings/google", "A");
  if (!themes.length) add("publish-manual", 5, "教室の学習支援を伝える投稿テーマを選ぶ", snapshot.demandStatus ? postTopics(snapshot).message : demand === null ? "検索需要の取得に失敗しました。需要に基づく推薦ではなく、実際の自習室・質問対応などから手動でテーマを選べます。" : "検索需要の保存データがありません。実際の定期テスト対策・自習室・面談内容から手動でテーマを選んでください。", snapshot.instagram ? "/dashboard/instagram" : "/dashboard/settings/google", "B", "手動テーマ");
  if (!snapshot.comparisons?.length) add("competitor-measurement", 6, "競合の実測データを準備する", snapshot.comparisons === null ? "競合計測を取得できませんでした。再取得してください。" : "保存済み競合計測がないため、比較結果は未判定です。", "/dashboard/rankings", "B");
  else {
    const latest = snapshot.comparisons.toSorted((a, b) => b.at.localeCompare(a.at))[0];
    add("competitor-improvement", 6, "競合計測から改善を1つ選ぶ", `${latest.keyword}（${latest.at.slice(0, 10)}）の${latest.competitors.length}校を参照できます。DAY3・DAY4と同じ口コミ依頼を重複記録せず、改善内容と実行前後を記録してください。`, "/dashboard/rankings", "B");
  }
  const history = doc.nextActionHistory ?? [];
  const latestRecords = new Map<string, NextActionRecord>();
  for (const record of history) latestRecords.set(record.key, record);
  const recentMission = (day: number) => {
    const at = doc.missions[day - 1].completedAt;
    return at !== null && elapsed(at, snapshot.at) < 7;
  };
  const available = availableActionCandidates(candidates, doc, snapshot.at);
  const active = [...latestRecords.values()].filter(r => r.status !== "COMPLETED");
  const days = missions.map(m => ({ day: m.day, actions: available.filter(a => a.day === m.day).slice(0, 3), active: active.filter(a => a.day === m.day) }));
  const additionalRequest = day3.status !== "COMPLETED" || recentMission(3)
    ? { count: 0, reason: "DAY3の依頼が進行中、または完了から7日以内です。追加依頼を重複させず、届いた口コミへの対応を優先します。" }
    : request;
  return { days, top: available[0] ?? null, available, active, history, request, additionalRequest };
}

export function updateNextAction(doc: ChallengeDocument, command: Record<string, unknown>, snapshot: Snapshot, actorId: string): ChallengeDocument {
  const next = structuredClone(doc);
  const plan = nextActions(doc, snapshot);
  if (command.action === "adopt-request-target") {
    if (command.day === 4) {
      if (doc.additionalRequestTarget || doc.missions[3].status !== "NOT_STARTED" || Number(doc.missions[3].evidence.requested ?? 0) > 0 || plan.additionalRequest.count === null) throw new ChallengeError("未着手で計測根拠がある場合のみ、追加依頼目標を適用できます。");
      next.additionalTarget = plan.additionalRequest.count;
      next.additionalRequestTarget = { ...plan.additionalRequest, count: plan.additionalRequest.count, at: snapshot.at, actorId };
      return next;
    }
    if (doc.requestTarget || doc.missions[2].status !== "NOT_STARTED" || Number(doc.missions[2].evidence.requested ?? 0) > 0 || plan.request.count === null) throw new ChallengeError("未着手で計測根拠がある場合のみ、依頼目標を適用できます。");
    next.requestTarget = { count: plan.request.count, reason: plan.request.reason, at: snapshot.at, actorId };
    return next;
  }
  const key = text(command.key);
  const note = text(command.note);
  const statuses = ["IN_PROGRESS", "WAITING", "DEFERRED", "COMPLETED"];
  if (!statuses.includes(String(command.status))) throw new ChallengeError("アクションの状態が正しくありません。");
  const history = next.nextActionHistory ?? [];
  const previous = history.findLast(r => r.key === key);
  const active = previous && previous.status !== "COMPLETED" ? previous : null;
  const candidate = plan.available.find(a => a.key === key);
  if (!active && !candidate) throw new ChallengeError("対象の提案は更新済みです。最新データを確認してください。", 409);
  if (command.status !== "IN_PROGRESS" && !note) throw new ChallengeError("実行内容・確認待ち・後日対応の理由を記録してください。");
  if (!active && command.status !== "IN_PROGRESS") throw new ChallengeError("まず提案を開始し、その後に実行結果を記録してください。");
  const record: NextActionRecord = { ...(active ?? candidate!), proposedAt: active?.proposedAt ?? snapshot.at, startedAt: active?.startedAt ?? snapshot.at,
    updatedAt: snapshot.at, completedAt: command.status === "COMPLETED" ? snapshot.at : null, status: command.status as NextActionRecord["status"], note, actorId };
  if (active) history[history.indexOf(active)] = record; else history.push(record);
  next.nextActionHistory = history;
  return next;
}

// Mission evidence remains the source of truth; completing a proposal never fakes a DAY clear.
export function reconcileActionHistory(doc: ChallengeDocument, snapshot: Snapshot, actorId: string): ChallengeDocument {
  if (!doc.nextActionHistory) return doc;
  const next = structuredClone(doc);
  next.nextActionHistory = doc.nextActionHistory.map(record => {
    if (record.status === "COMPLETED") return record;
    const mission = doc.missions[record.day - 1];
    if (mission.updatedAt !== snapshot.at) return record;
    const field = missions[record.day - 1].fields.find(f => record.key === `check-${record.day}-${f.key}`);
    const done = field ? fieldProgress(field, mission).state === "GOOD" : mission.status === "COMPLETED";
    if (!done || record.key === "google-connect" && snapshot.google !== true) return record;
    return { ...record, status: "COMPLETED", note: mission.note || "DAYの確認項目に実行済みの記録を保存", actorId, updatedAt: snapshot.at, completedAt: snapshot.at };
  });
  return next;
}
