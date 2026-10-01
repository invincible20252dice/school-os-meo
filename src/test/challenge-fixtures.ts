import { missions, startChallenge, type Evidence, type Snapshot } from "@/lib/challenge";
export function snapshot(): Snapshot {
  return { at: "2026-10-01T09:00:00.000Z", google: true, instagram: false, errors: [],
    reviews: { count: 3, rating: 4, pending: 1, replyRate: 66.7, newCount: null }, surveyResponses: null,
    posts: { count: 0, latestAt: null }, comparisons: [{ id: "measurement-1", keyword: "地域 塾", at: "2026-10-01T08:00:00Z", competitors: [{ name: "競合校", rating: 4, reviewCount: 12 }] }] };
}
export function challengeDocument() { return startChallenge(10, snapshot()); }
export function completeCommand(day: number) {
  const evidence: Evidence = {};
  for (const f of missions[day - 1].fields) evidence[f.key] = f.type === "number" ? 10 : f.options?.[0] ?? "実行証跡";
  if (day === 6) evidence.comparisonId = "measurement-1";
  return { action: "mission", day, status: "COMPLETED", evidence, note: "実際に行った確認内容" };
}
