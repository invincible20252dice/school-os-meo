export const challengeStatuses = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DEFERRED", "COMPLETED"] as const;
export type ChallengeStatus = typeof challengeStatuses[number];
export const statusLabels: Record<ChallengeStatus, string> = {
  NOT_STARTED: "未着手", IN_PROGRESS: "対応中", WAITING: "確認待ち", DEFERRED: "後で対応", COMPLETED: "完了",
};
export type Evidence = Record<string, string | number>;
export type Priority = "S" | "A" | "B" | "C";
export type Field = { key: string; label: string; type: "select" | "number" | "text"; options?: string[]; priority?: Priority; question?: string };
const check = (key: string, label: string, options = ["確認済み", "修正済み", "後で対応"]) => ({ key, label, type: "select" as const, options });
export const missions: Array<{ day: number; title: string; minutes: number; criterion: string; links: Array<{ label: string; path: string }>; fields: Field[] }> = [
  { day: 1, title: "Google集客の土台を整える", minutes: 10, criterion: "基本情報を確認し、修正・確認・後日対応の記録を終える。後日対応は残課題として保持します。", links: [{ label: "Google連携・店舗情報", path: "/dashboard/settings/google" }], fields: [check("name", "正式な教室名"), check("phone", "電話番号"), check("address", "住所・地図ピン"), check("category", "カテゴリ"), check("website", "Webサイト"), check("description", "教室紹介文"), check("hours", "通常・特別営業時間")] },
  { day: 2, title: "写真で教室の安心感を伝える", minutes: 15, criterion: "各カテゴリの写真を追加、既存写真で充足を確認、または対象外の理由を記録する（手動確認）。", links: [{ label: "Google店舗設定", path: "/dashboard/settings/google" }], fields: ["外観", "入口", "教室", "授業", "自習", "講師", "面談", "駐車場・駐輪場"].map((label, i) => check(`photo${i}`, label, ["追加済み", "既存写真で充足", "対象外"])) },
  { day: 3, title: "保護者の声を集める", minutes: 10, criterion: "実際に利用した保護者10名へ依頼した実行記録を残す。評価による依頼先の選別は行いません。", links: [{ label: "アンケートを選ぶ・URLを取得", path: "/dashboard/surveys" }], fields: [{ key: "requested", label: "実際に依頼した人数（累計）", type: "number" }] },
  { day: 4, title: "口コミを継続して強化する", minutes: 10, criterion: "開始時に決めた人数への追加依頼と、対象口コミへの対応を記録する。対象がない場合は対象なしと記録。", links: [{ label: "口コミ一覧・返信", path: "/dashboard/reviews" }, { label: "口コミAI分析", path: "/dashboard/reviews/analytics" }], fields: [{ key: "requested", label: "DAY3とは別に追加依頼した人数（累計）", type: "number" }, check("reviews", "届いた口コミへの対応", ["対応済み", "対象なし"])] },
  { day: 5, title: "Google投稿で情報を届ける", minutes: 10, criterion: "Google側で公開を確認し、公開URLまたは投稿名・公開日時を記録する。下書き作成だけでは完了にしません。", links: [{ label: "Instagram連携・Google同期", path: "/dashboard/instagram" }, { label: "実績マルチ投稿", path: "/dashboard/posts/results" }], fields: [check("published", "Googleでの公開確認", ["公開確認済み"]), { key: "publication", label: "公開URL または 投稿名・公開日時", type: "text" }] },
  { day: 6, title: "競合との差を1つ改善する", minutes: 15, criterion: "保存済み競合分析から改善項目を1つ選び、実行前後を記録する。順位変化との因果関係は断定しません。", links: [{ label: "順位・競合の実測データ", path: "/dashboard/rankings" }], fields: [{ key: "comparisonId", label: "参照する計測ID", type: "text" }, { key: "improvement", label: "実行した改善項目", type: "text" }, { key: "before", label: "実行前", type: "text" }, { key: "after", label: "実行後", type: "text" }] },
  { day: 7, title: "問い合わせ導線を確認する", minutes: 10, criterion: "問い合わせ先・リンク・フォームを確認し、テストを記録する。テスト問い合わせは成果から除外します。", links: [{ label: "Google・問い合わせ先設定", path: "/dashboard/settings/google" }], fields: [check("contact", "問い合わせ先の確認", ["確認済み"]), check("links", "Googleからリンク先への遷移", ["確認済み"]), check("test", "電話・フォーム・LINE等の導線テスト", ["実施済み"])] },
];
// Display priorities for the existing manual checks, not an automated diagnostic score.
for (const mission of missions) {
  for (const field of mission.fields) {
    field.priority = ["website", "contact", "links", "test"].includes(field.key) ? "S" : ["hours", "description"].includes(field.key) || mission.day === 2 ? "B" : "A";
    if ([1, 2, 7].includes(mission.day)) {
      field.options = [...field.options!, "要改善", ...field.options!.includes("後で対応") ? [] : ["後で対応"]];
      field.question = field.key === "test" ? "保護者の立場で、迷わず問い合わせまで進めましたか？" : `${field.label}は適切な状態になっていますか？`;
    }
  }
}
export type Snapshot = {
  at: string;
  reviews: { count: number; rating: number | null; pending: number; replyRate: number | null; newCount: number | null } | null;
  surveyResponses: number | null;
  posts: { count: number; latestAt: string | null } | null;
  comparisons: Array<{ id: string; keyword: string; at: string; competitors: Array<{ name: string; rating: number | null; reviewCount: number | null }> }> | null;
  google: boolean | null; instagram: boolean | null;
  errors: string[];
};
export type MissionProgress = { day: number; status: ChallengeStatus; evidence: Evidence; note: string; updatedAt: string | null; completedAt: string | null; actorId: string | null };
export type ActionRecord = { status: "COMPLETED" | "DEFERRED"; note: string; at: string; actorId: string };
export type ChallengeDocument = {
  schemaVersion: 1; startedAt: string; completedAt: string | null; additionalTarget: number;
  missions: MissionProgress[]; baseline: Snapshot; after: Snapshot | null;
  actions: Record<string, ActionRecord>;
  inquiries: { google: number; unknown: number; other: number; tests: number; recordedAt: string; actorId: string } | null;
};
export class ChallengeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ChallengeError("入力形式が正しくありません。");
  return value as Record<string, unknown>;
}
export function count(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10000) throw new ChallengeError("人数・件数は0〜10000の整数で入力してください。");
  return value;
}
export function text(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) throw new ChallengeError("記録は2000文字以内で入力してください。");
  return value.trim();
}
export function startChallenge(target: unknown, snapshot: Snapshot): ChallengeDocument {
  const additionalTarget = count(target);
  if (additionalTarget < 1) throw new ChallengeError("追加依頼の目標人数は1名以上にしてください。");
  return { schemaVersion: 1, startedAt: snapshot.at, completedAt: null, additionalTarget,
    missions: missions.map(m => ({ day: m.day, status: "NOT_STARTED", evidence: {}, note: "", updatedAt: null, completedAt: null, actorId: null })),
    baseline: snapshot, after: null, actions: {}, inquiries: null };
}
export function readDocument(value: unknown): ChallengeDocument {
  const row = object(value);
  if (row.schemaVersion !== 1 || !Array.isArray(row.missions) || row.missions.length !== 7) throw new ChallengeError("進捗データの形式を確認できません。管理者にお問い合わせください。", 500);
  return row as unknown as ChallengeDocument;
}
export function remainingChecks(doc: ChallengeDocument) {
  return doc.missions.flatMap(m => Object.entries(m.evidence).filter(([, value]) => value === "後で対応" || value === "要改善").map(([key]) => ({ day: m.day, key, label: missions[m.day - 1].fields.find(f => f.key === key)!.label })));
}
export type WeeklyAction = { key: string; title: string; reason: string; path: string; day?: number; status: string };
export function weeklyActions(doc: ChallengeDocument, snapshot: Snapshot): WeeklyAction[] {
  const actions: WeeklyAction[] = doc.missions.filter(m => m.status !== "COMPLETED").map(m => ({ key: `day-${m.day}`, title: missions[m.day - 1].title, reason: `DAY${m.day}：${statusLabels[m.status]}`, path: `/dashboard/challenge?day=${m.day}`, day: m.day, status: m.status }));
  for (const item of remainingChecks(doc)) {
    const warning = doc.missions[item.day - 1].evidence[item.key] === "要改善";
    actions.push({ key: `check-${item.day}-${item.key}`, title: item.label, reason: warning ? "要改善として記録された残課題" : "後日対応として記録された残課題", path: `/dashboard/challenge?day=${item.day}`, day: item.day, status: warning ? "IN_PROGRESS" : "DEFERRED" });
  }
  if (snapshot.google === false) actions.push({ key: "google-connect", title: "Googleアカウントを連携する", reason: "保存済み設定でGoogle連携が未完了", path: "/dashboard/settings/google", status: "NOT_STARTED" });
  if (snapshot.reviews && snapshot.reviews.pending > 0) actions.push({ key: "pending-replies", title: "未対応口コミを確認する", reason: `DB内に未対応口コミ${snapshot.reviews.pending}件`, path: "/dashboard/reviews", status: "NOT_STARTED" });
  if (snapshot.posts && (!snapshot.posts.latestAt || new Date(snapshot.at).getTime() - new Date(snapshot.posts.latestAt).getTime() > 14 * 86400000)) actions.push({ key: "publish-post", title: "Google投稿を確認する", reason: "過去14日以内の同期投稿記録がありません（外部での公開状況は要確認）", path: "/dashboard/instagram", status: "NOT_STARTED" });
  return actions.map(a => ({ ...a, status: a.day ? a.status : doc.actions[a.key]?.status ?? a.status }));
}
export function updateChallenge(doc: ChallengeDocument, command: Record<string, unknown>, snapshot: Snapshot, actorId: string): ChallengeDocument {
  const next = structuredClone(doc);
  if (command.action === "inquiries") {
    next.inquiries = { google: count(command.google), unknown: count(command.unknown), other: count(command.other), tests: count(command.tests), recordedAt: snapshot.at, actorId };
    return next;
  }
  if (command.action === "weekly") {
    const key = text(command.key);
    const action = weeklyActions(doc, snapshot).find(a => a.key === key && !a.day);
    if (!action || !["COMPLETED", "DEFERRED"].includes(String(command.status))) throw new ChallengeError("更新対象のアクションを確認してください。");
    const note = text(command.note);
    if (!note) throw new ChallengeError("実行内容または後日対応の理由を記録してください。");
    next.actions[key] = { status: command.status as ActionRecord["status"], note, at: snapshot.at, actorId };
    return next;
  }
  if (command.action !== "mission") throw new ChallengeError("操作が正しくありません。");
  const mission = missions.find(m => m.day === command.day);
  if (!mission || !challengeStatuses.includes(command.status as ChallengeStatus)) throw new ChallengeError("DAY・状態が正しくありません。");
  const raw = object(command.evidence);
  const evidence: Evidence = {};
  for (const field of mission.fields) {
    if (raw[field.key] === undefined || raw[field.key] === "") continue;
    evidence[field.key] = field.type === "number" ? count(raw[field.key]) : text(raw[field.key]);
    if (field.options && !field.options.includes(String(evidence[field.key]))) throw new ChallengeError(`${field.label}の選択内容を確認してください。`);
  }
  const note = text(command.note);
  const status = command.status as ChallengeStatus;
  if (["DEFERRED", "WAITING", "COMPLETED"].includes(status) && !note) throw new ChallengeError("実行内容・対象外の理由・確認待ちの内容を記録してください。");
  const previous = doc.missions[mission.day - 1];
  if (status === "COMPLETED" && previous.status !== "COMPLETED") {
    if (Object.values(evidence).includes("要改善") || (mission.day !== 1 && Object.values(evidence).includes("後で対応"))) throw new ChallengeError("未対応項目が残っています。対応中または確認待ちで保存してください。");
    if (mission.fields.some(f => evidence[f.key] === undefined || evidence[f.key] === "")) throw new ChallengeError("すべての確認項目を記録してから完了してください。");
    if (mission.day === 3 && Number(evidence.requested) < 10) throw new ChallengeError("実際に依頼した人数が10名に達していません。");
    if (mission.day === 4) {
      if (Number(evidence.requested) < doc.additionalTarget) throw new ChallengeError("追加依頼の目標人数に達していません。");
      if (evidence.reviews === "対象なし" && (!snapshot.reviews || snapshot.reviews.pending > 0)) throw new ChallengeError("未対応口コミを確認できないか、対応対象が残っています。");
    }
    if (mission.day === 6 && !snapshot.comparisons?.some(c => c.id === evidence.comparisonId)) throw new ChallengeError("保存済みの競合計測を選択してください。計測がない場合は確認待ちとして保存できます。");
  }
  next.missions[mission.day - 1] = { day: mission.day, status, evidence, note, actorId, updatedAt: snapshot.at,
    completedAt: status === "COMPLETED" ? previous.completedAt ?? snapshot.at : null };
  const complete = next.missions.every(m => m.status === "COMPLETED");
  next.completedAt = complete ? doc.completedAt ?? snapshot.at : null;
  if ((mission.day === 7 && status === "COMPLETED" && previous.status !== "COMPLETED") || complete && !doc.completedAt) next.after = snapshot;
  return next;
}
