import { prisma } from "./prisma";
import type { Snapshot } from "./challenge";
import { loadSearchKeywords } from "./google-search-keywords";

async function read<T>(label: string, query: () => Promise<T>, errors: string[]): Promise<T | null> {
  try { return await query(); } catch {
    console.error("[Challenge data]", { section: label });
    errors.push(`${label}を取得できませんでした。`);
    return null;
  }
}
function competitors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || !item.name.trim()) return [];
    return [{ name: item.name, rating: typeof item.rating === "number" ? item.rating : null,
      reviewCount: typeof item.reviewCount === "number" ? item.reviewCount : null }];
  });
}
export async function loadChallengeData(schoolId: string, startedAt: string | null, now = new Date()) {
  const errors: string[] = [];
  const settings = await read("Google連携", () => prisma.schoolSetting.findUnique({ where: { schoolId }, select: { googleConnected: true, selectedGbpLocationId: true } }), errors);
  const instagram = await read("Instagram連携", () => prisma.instagramSetting.findUnique({ where: { schoolId }, select: { instagramBusinessAccountId: true } }), errors);
  const reviews = await read("口コミ", () => prisma.review.findMany({ where: { schoolId, source: "GOOGLE", status: { notIn: ["DRAFT", "GENERATED", "ARCHIVED"] },
    AND: ["test_", "mock", "local_test_review_"].flatMap(prefix => [
      { NOT: { id: { startsWith: prefix } } },
      { OR: [{ googleReviewId: null }, { NOT: { googleReviewId: { startsWith: prefix } } }] },
      { OR: [{ gbpReviewId: null }, { NOT: { gbpReviewId: { startsWith: prefix } } }] },
    ]) }, select: { rating: true, repliedAt: true, replyText: true, postedAt: true } }), errors);
  const responses = startedAt ? await read("アンケート回答", () => prisma.review.count({ where: { schoolId, source: "SURVEY", createdAt: { gte: new Date(startedAt), lte: now } } }), errors) : null;
  const posts = await read("同期投稿", () => prisma.syncedPost.findMany({ where: { schoolId }, select: { syncedAt: true }, orderBy: { syncedAt: "desc" } }), errors);
  const rankings = await read("競合計測", () => prisma.targetKeyword.findMany({ where: { schoolId, isActive: true }, select: { keyword: true,
    rankHistories: { orderBy: { checkedAt: "desc" }, take: 1, select: { id: true, checkedAt: true, competitorData: true } } } }), errors);
  const surveys = await read("アンケート", () => prisma.survey.findMany({ where: { schoolId, isValid: true }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } }), errors);
  const demand = await loadSearchKeywords(schoolId);
  if (demand.status === "API_ERROR") errors.push("Google検索語句APIの取得に失敗しました。Google連携全体の状態とは別です。");
  if (demand.status === "DB_ERROR") errors.push("検索語句のDB取得・保存に失敗しました。");
  const latestReview = reviews?.flatMap(r => r.postedAt && r.postedAt <= now ? [r.postedAt.toISOString()] : []).sort().at(-1) ?? null;
  const rated = reviews?.flatMap(r => r.rating !== null && r.rating >= 1 && r.rating <= 5 ? [r.rating] : []) ?? [];
  const replied = reviews?.filter(r => r.repliedAt && r.replyText?.trim()).length ?? 0;
  const snapshot: Snapshot = {
    at: now.toISOString(),
    latestReviewAt: latestReview,
    demandStatus: demand.status,
    demand: demand.status === "AVAILABLE" || demand.status === "EMPTY" ? demand.rows.flatMap(d => d.impressions === null ? [] : [{ query: d.query, month: demand.diagnostic.month, impressions: d.impressions, updatedAt: demand.fetchedAt! }]) : null,
    google: errors.includes("Google連携を取得できませんでした。") ? null : Boolean(settings?.googleConnected && settings.selectedGbpLocationId),
    instagram: errors.some(e => e.startsWith("Instagram")) ? null : Boolean(instagram?.instagramBusinessAccountId),
    reviews: reviews ? { count: reviews.length, rating: rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null,
      pending: reviews.length - replied, replyRate: reviews.length ? replied / reviews.length * 100 : null,
      newCount: startedAt && reviews.every(r => r.postedAt) ? reviews.filter(r => r.postedAt! >= new Date(startedAt) && r.postedAt! <= now).length : null } : null,
    surveyResponses: responses,
    posts: posts ? { count: posts.length, latestAt: posts[0]?.syncedAt.toISOString() ?? null } : null,
    comparisons: rankings ? rankings.flatMap(k => k.rankHistories.flatMap(h => {
      const rows = competitors(h.competitorData);
      return rows.length ? [{ id: h.id, keyword: k.keyword, at: h.checkedAt.toISOString(), competitors: rows }] : [];
    })) : null,
    errors,
  };
  return { snapshot, surveys };
}
