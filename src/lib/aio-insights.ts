import { measurementState, type MeasurementView } from "./aio-view";
import { guideForAction } from "./action-guides";
import type { NextAction } from "./challenge-next-actions";

export function aggregateAio(records: Array<MeasurementView | null>) {
  const successes = records.filter(r => measurementState(r, true).label === "計測成功");
  const recommended = successes.filter(r => r!.recommended).length;
  return { successful: successes.length, recommended,
    rate: successes.length ? Math.round(recommended / successes.length * 100) : null,
    failed: records.filter(r => measurementState(r, true).label === "計測失敗").length,
    allRecommended: records.length > 0 && recommended === records.length };
}

// One snapshot per Japan calendar day. A later failed attempt replaces, not hides
// behind, an earlier successful attempt. Never fill missing days with fake zeros.
export function aioHistory(keywords: Array<{ id: string; history?: MeasurementView[] }>) {
  const at = (record: MeasurementView) => record.measuredAt || record.createdAt;
  const events = keywords.flatMap(k => (k.history || []).map(record => ({ keywordId: k.id, record })))
    .sort((a, b) => at(a.record).localeCompare(at(b.record)) || a.record.id.localeCompare(b.record.id));
  const latest = new Map<string, MeasurementView>();
  const days = new Map<string, ReturnType<typeof aggregateAio> & { date: string }>();
  for (const { keywordId, record } of events) {
    const date = new Date(new Date(at(record)).getTime() + 9 * 3600000).toISOString().slice(0, 10);
    latest.set(keywordId, record);
    days.set(date, { date, ...aggregateAio([...latest.values()]) });
  }
  return [...days.values()];
}

export type AioCompetitor = { name: string; evidence: string };
export const normalizeSchoolName = (name: string) => name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
export function extractCompetitors(response: string, ownName: string): AioCompetitor[] {
  // Intentionally high precision, not comprehensive entity recognition. Only named
  // list/heading entries in an explicitly recommended list can become candidates.
  if (!/(おすすめ|お勧め|推奨)/.test(response.slice(0, 300))) return [];
  // Unlinked bold headings also end the prior school's evidence. Place metadata
  // uses separators and stays with its school; unlinked candidates remain omitted.
  const blocks = response.split(/\n(?=(?:#{1,4}\s|\d+[.)．、]\s*|[-*]\s+|\*\*\[|\*\*(?!\[)[^*\n·|]+\*\*[ \t]*(?:\n|$)))/);
  if (/(おすすめ(?:の塾)?はありません|推奨できません|推奨しません)/.test(blocks[0])) return [];
  const candidates: AioCompetitor[] = [];
  for (const block of blocks) {
    const heading = block.split("\n")[0];
    const match = /^(?:#{1,4}\s*|\d+[.)．、]\s*|[-*]\s+|(?=\*\*\[))\*{0,2}(?:\[([^\]]+)\]\([^\s)]+\)|([^*\n:：]+))/.exec(heading);
    if (!match) continue;
    const name = (match[1] || match[2]).trim();
    if (name.length > 80 || !/(塾|予備校|アカデミー)/.test(name) || /(ランキング|サイト|検索|市役所|教育委員会|大学$|高校$|高等学校$|駅$)/.test(name)) continue;
    if (/(おすすめしません|推奨しません|非推奨|おすすめできません|おすすめではありません|推奨対象外|比較サイト|検索サービス|行政機関)/.test(block)) continue;
    if (normalizeSchoolName(name) === normalizeSchoolName(ownName) || candidates.some(c => normalizeSchoolName(c.name) === normalizeSchoolName(name))) continue;
    if (!/(指導|学習|受験|授業|自習|個別|生徒|予備校|学習塾)/.test(block.slice(heading.length))) continue;
    candidates.push({ name, evidence: block.trim().slice(0, 1800) });
  }
  return candidates.slice(0, 10);
}

export function aioActions(record: MeasurementView | null, competitors: AioCompetitor[], googleConnected?: boolean | null, reviewGap?: number | null): NextAction[] {
  if (measurementState(record, true).label !== "計測成功" || record!.recommended) return [];
  const keys: Array<[string, number, string]> = [];
  if (googleConnected === false) keys.push(["google-connect", 1, "保存済み設定ではGoogle店舗が未連携です。対象店舗を確認してください。"]);
  if (reviewGap != null && reviewGap > 0) keys.push(["request-reviews", 3, `同じ保存済み競合計測では、推奨候補の口コミ数が自校舎より${reviewGap}件多くあります。実際の利用者へ中立的に感想を依頼する導線を確認しましょう。推薦への効果を保証するものではありません。`]);
  const evidence = competitors.map(c => c.evidence).join("\n");
  if (/自習/.test(evidence)) keys.push(["check-2-photo4", 2, "推奨候補の回答に自習環境の記載があります。自校舎で実際に提供している環境と写真を確認しましょう。"]);
  if (competitors.length) keys.push(["check-1-description", 1, "推奨候補の説明と自校舎の対象・指導内容を照合し、確認できた事実を紹介文に反映しましょう。"]);
  keys.push([competitors.length ? "publish-manual" : "competitor-improvement", competitors.length ? 5 : 6,
    competitors.length ? "この検索テーマでは自校舎の推奨がありません。実際の取り組みを確認し、テーマに沿った投稿の下書きを作りましょう。" : "この回答から確実な競合候補を抽出できませんでした。回答と保存済みの競合情報を確認しましょう。"]);
  return keys.slice(0, 3).map(([key, day, reason]) => {
    const guide = guideForAction(key)!;
    return { key, day, reason, title: guide.title, path: `/dashboard/challenge?day=${day}`, priority: "B", minutes: 10, source: "保存済みデータ" };
  });
}
