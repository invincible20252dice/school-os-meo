export const opinionCategories = ["成果実感・成績向上", "指導品質・講師対応", "カリキュラム・個別最適化", "学習環境・自習室", "料金", "運営・連絡", "通塾・立地", "その他"] as const;
export const sentiments = ["positive", "neutral", "negative"] as const;
export const languages = ["ja", "en", "other"] as const;
export type AnalyticsLanguage = "all" | typeof languages[number];
export type ReviewAnalysis = {
  reviewId: string;
  language: typeof languages[number];
  opinions: { category: typeof opinionCategories[number]; sentiment: typeof sentiments[number]; quote: string }[];
};
export type AnalysisInput = { id: string; text: string };
export type AnalyticsResponse = {
  success: true;
  schoolId: string | null;
  schoolName: string;
  totalReviews: number;
  sampledReviews: number;
  textReviews: number;
  limit: number;
  analyses: ReviewAnalysis[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseReviewAnalysis(value: unknown, inputs: AnalysisInput[]): ReviewAnalysis[] {
  if (!record(value) || !Array.isArray(value.reviews) || value.reviews.length !== inputs.length) throw new Error("INVALID_ANALYSIS");
  const sources = new Map(inputs.map(item => [item.id, item.text]));
  const seen = new Set<string>();
  return value.reviews.map(row => {
    if (!record(row) || typeof row.reviewId !== "string" || !sources.has(row.reviewId) || seen.has(row.reviewId)
      || !languages.includes(row.language as ReviewAnalysis["language"]) || !Array.isArray(row.opinions) || row.opinions.length > 8) throw new Error("INVALID_ANALYSIS");
    seen.add(row.reviewId);
    const source = sources.get(row.reviewId)!;
    const categories = new Set<string>();
    const opinions = row.opinions.map(opinion => {
      if (!record(opinion) || !opinionCategories.includes(opinion.category as typeof opinionCategories[number])
        || !sentiments.includes(opinion.sentiment as typeof sentiments[number]) || typeof opinion.quote !== "string"
        || !opinion.quote.trim() || opinion.quote.length > 500 || !source.includes(opinion.quote)
        || categories.has(String(opinion.category))) throw new Error("INVALID_ANALYSIS");
      categories.add(String(opinion.category));
      return { category: opinion.category, sentiment: opinion.sentiment, quote: opinion.quote } as ReviewAnalysis["opinions"][number];
    });
    return { reviewId: row.reviewId, language: row.language, opinions } as ReviewAnalysis;
  });
}

const percentage = (count: number, total: number) => total ? Math.round(count / total * 1000) / 10 : 0;

export function aggregateReviewAnalysis(analyses: ReviewAnalysis[], language: AnalyticsLanguage = "all") {
  const selected = analyses.filter(row => language === "all" || row.language === language);
  const opinions = selected.flatMap(row => row.opinions.map(opinion => ({ ...opinion, reviewId: row.reviewId })));
  const total = opinions.length;
  return {
    tabs: (["all", ...languages] as const).map(key => ({ key, count: analyses.filter(row => key === "all" || row.language === key).length })),
    totalOpinions: total,
    reviewCount: selected.length,
    sentiment: Object.fromEntries(sentiments.map(key => [key, percentage(opinions.filter(item => item.sentiment === key).length, total)])) as Record<typeof sentiments[number], number>,
    categories: opinionCategories.map(name => {
      const count = opinions.filter(item => item.category === name).length;
      return { name, count, percentage: percentage(count, total) };
    }).filter(item => item.count > 0),
    opinions,
  };
}

export function isAnalyticsResponse(value: unknown): value is AnalyticsResponse {
  if (!record(value) || value.success !== true || !(value.schoolId === null || typeof value.schoolId === "string") || typeof value.schoolName !== "string"
    || ![value.totalReviews, value.sampledReviews, value.textReviews, value.limit].every(n => typeof n === "number" && Number.isInteger(n) && n >= 0)
    || !Array.isArray(value.analyses)) return false;
  const data = value as unknown as AnalyticsResponse;
  if (data.limit === 0 || data.sampledReviews > data.limit || data.totalReviews < data.sampledReviews || data.sampledReviews < data.textReviews || data.analyses.length !== data.textReviews) return false;
  try {
    // Validate the same strict shape at the browser boundary; source grounding is enforced on the server.
    parseReviewAnalysis({ reviews: data.analyses }, data.analyses.map(row => ({ id: row.reviewId, text: row.opinions.map(o => o.quote).join("\n") })));
    return true;
  } catch {
    return false;
  }
}
