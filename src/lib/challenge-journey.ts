import { missions, photoConfirmation, type ChallengeDocument, type MissionProgress, type Snapshot } from "./challenge";
import { dayProgress, fieldProgress, priorityWeights } from "./challenge-progress";

export const dayGoals = [
  "Googleで教室を見つけた保護者が、基本情報で迷わない状態にします。",
  "保護者がGoogleマップを見たときに、教室の雰囲気が写真から分かる状態にします。",
  "口コミをお願いする流れを作り、保護者のリアルな声を増やし始めます。",
  "口コミへの対応を整え、Google上での信頼をさらに高めます。",
  "保護者が検索しているテーマについて、Google上で情報発信します。",
  "周辺の競合と比較して、優先度の高い改善を1つ実行します。",
  "Googleで興味を持った保護者が、迷わず問い合わせできる状態にします。",
];
export const dayTitle = (day: number) => day === 7 ? "問い合わせ導線を改善する" : missions[day - 1].title;
export const fieldAnchor = (day: number, key: string) => `challenge-day-${day}-${key}`;

// Presentation only: preserve the server's CLEAR validation and persisted evidence.
export function dayChecks(doc: ChallengeDocument, progress: MissionProgress, snapshot: Snapshot) {
  const definition = missions[progress.day - 1];
  const measured = dayProgress(progress, doc.additionalTarget, snapshot, doc.requestTarget?.count);
  return definition.fields.map(field => {
    const item = measured.items.find(item => item.key === field.key) ?? fieldProgress(field, progress);
    const missingPhoto = progress.day === 2 ? photoConfirmation(progress.evidence, progress.note).remaining.find(missing => missing.key === field.key) : undefined;
    if (missingPhoto) return { ...item, reason: missingPhoto.reason, state: item.state === "GOOD" ? "UNCHECKED" as const : item.state };
    // A zero target still requires an explicit execution record; DAY6 needs a valid saved measurement.
    if (field.key === "requested" && progress.evidence.requested === undefined) return { ...item, state: "UNCHECKED" as const };
    if (field.key === "comparisonId" && !snapshot.comparisons?.some(c => c.id === progress.evidence.comparisonId)) return { ...item, state: "UNCHECKED" as const };
    return item;
  });
}
export function deriveJourney(doc: ChallengeDocument, snapshot: Snapshot, requestedDay = 0) {
  const currentDay = missions.map(m => doc.missions.find(saved => saved.day === m.day)!).find(m => m.status !== "COMPLETED") ?? null;
  const viewingDay = doc.missions.find(m => m.day === requestedDay) ?? currentDay;
  const checks = currentDay ? dayChecks(doc, currentDay, snapshot) : [];
  const incomplete = checks.filter(item => item.state !== "GOOD");
  const currentTask = [...incomplete].sort((a, b) => Number(a.deferred) - Number(b.deferred) || priorityWeights[b.priority] - priorityWeights[a.priority])[0] ?? null;
  return { currentDay, viewingDay, currentTask, dayCompletion: { done: checks.length - incomplete.length, total: checks.length, remaining: incomplete.length }, completed: doc.missions.filter(m => m.status === "COMPLETED").length };
}
