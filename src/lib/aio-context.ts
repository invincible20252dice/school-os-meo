import { normalizeCompetitorData } from "./dashboard-rankings";
import { normalizeSchoolName, type AioCompetitor } from "./aio-insights";
export type SavedAioCompetitor = { name: string; address: string; rating: number | null; reviewCount: number | null; checkedAt: string };
export function savedAioCompetitors(snapshots: Array<{ checkedAt: Date; competitorData: unknown }>): SavedAioCompetitor[] {
  const latest = snapshots.toSorted((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
  return latest ? normalizeCompetitorData(latest.competitorData, null).map(c => ({ name: c.name, address: c.address,
    rating: c.rating !== null && c.rating >= 0 && c.rating <= 5 ? c.rating : null,
    reviewCount: c.reviewCount !== null && Number.isInteger(c.reviewCount) && c.reviewCount >= 0 ? c.reviewCount : null,
    checkedAt: latest.checkedAt.toISOString() })) : [];
}
export function matchAioCompetitor(candidate: AioCompetitor, saved: SavedAioCompetitor[]) {
  const matches = saved.filter(c => normalizeSchoolName(c.name) === normalizeSchoolName(candidate.name));
  // Different branches can share a brand name. Ambiguous names are never merged.
  return matches.length === 1 ? matches[0] : null;
}

export function aioCompetitorDifference(candidate: AioCompetitor, ownName: string, saved: SavedAioCompetitor[]) {
  const other = matchAioCompetitor(candidate, saved), own = matchAioCompetitor({ name: ownName, evidence: "" }, saved);
  return { other, own,
    reviewGap: other?.reviewCount != null && own?.reviewCount != null ? other.reviewCount - own.reviewCount : null,
    ratingGap: other?.rating != null && own?.rating != null ? Math.round((other.rating - own.rating) * 10) / 10 : null };
}
