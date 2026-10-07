import { buildRankSearchLabel, normalizeLocationParams } from "./location-params";

type DecimalLike = {
  toNumber?: () => number;
  toString?: () => string;
};

export type DashboardSchoolRecord = {
  id: string;
  name: string;
  prefecture?: string | null;
  city?: string | null;
  addressLine?: string | null;
  googlePlaceId?: string | null;
};

export type DashboardTargetKeywordRecord = {
  id: string;
  schoolId: string;
  keyword: string;
  location: string;
  nearestStation: string;
  municipality: string;
  latitude?: DecimalLike | number | string | null;
  longitude?: DecimalLike | number | string | null;
  radiusMeters: number;
  isActive: boolean;
  createdAt: Date | string;
  rankHistories?: DashboardRankHistoryRecord[];
  aioScoreHistories?: DashboardAioScoreHistoryRecord[];
};

export type DashboardRankHistoryRecord = {
  id: string;
  keywordId?: string;
  rank: number | null;
  competitorData?: unknown;
  checkedAt?: Date | string;
  measuredAt?: Date | string;
};

export type DashboardKeywordRankRecord = {
  id: string;
  schoolId: string;
  keyword: string;
  searchArea: string;
  rank: number | null;
  previousRank: number | null;
  competitorData?: unknown;
  measuredAt: Date | string;
};

export type DashboardAioScoreHistoryRecord = {
  id: string;
  schoolId: string;
  keywordId: string;
  chatgptScore: number;
  geminiScore: number;
  googleAiScore: number;
  totalScore: number;
  aiMentions: unknown;
  checkedAt: Date | string;
};

export type DashboardCompetitor = {
  rank: number;
  name: string;
  rating: number | null;
  reviewCount: number | null;
  address: string;
  isOwnSchool: boolean;
};

export type DashboardRankingKeyword = {
  id: string;
  keyword: string;
  location: string;
  nearestStation: string;
  municipality: string;
  latitude?: number;
  longitude?: number;
  radiusMeters: number;
  isActive: boolean;
};

export type DashboardRankingLog = {
  id: string;
  keyword: string;
  rank: number | null;
  previousRank: number | null;
  searchArea: string;
  checkedAt: string;
};

export type DashboardRankingData = {
  dataSource?: "DATABASE" | "SIMULATION";
  school: {
    id: string;
    name: string;
    address: string;
    nearestStation: string;
    municipality: string;
    latitude?: number;
    longitude?: number;
  } | null;
  keywords: DashboardRankingKeyword[];
  rankingLogs: DashboardRankingLog[];
  currentKeyword: string;
  selectedKeyword: DashboardRankingKeyword | null;
  measuredAt: string | null;
  currentRank: number | null;
  previousRank: number | null;
  searchLabel: string;
  competitors: DashboardCompetitor[];
  history: Array<{ date: string; rank: number | null }>;
  aio: {
    checkedAt: string;
    summary: {
      chatgptScore: number;
      geminiScore: number;
      googleAiScore: number;
      totalScore: number;
    };
    trend: Array<{ date: string; score: number }>;
    radar: Array<{ axis: string; ownSchool: number; competitor: number }>;
    keywordRows: Array<{
      keyword: string;
      chatgptScore: number;
      geminiScore: number;
      googleAiScore: number;
      totalScore: number;
      status: string;
    }>;
    mentions: {
      chatgpt: string;
      gemini: string;
      googleAi: string;
    };
  };
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object" && "toNumber" in value) {
    const resolved = (value as DecimalLike).toNumber?.();
    return typeof resolved === "number" && Number.isFinite(resolved)
      ? resolved
      : undefined;
  }

  const parsed = Number(
    typeof value === "object" && value && "toString" in value
      ? (value as DecimalLike).toString?.()
      : value,
  );

  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateLabel(value: Date | string | undefined, full = false) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return full ? date.toISOString() : date.toISOString().slice(0, 10);
}

function fullAddress(school: DashboardSchoolRecord | null) {
  return [school?.prefecture, school?.city, school?.addressLine]
    .map(text)
    .filter(Boolean)
    .join("");
}

function normalizeCompetitorData(value: unknown, school: DashboardSchoolRecord | null) {
  const items = Array.isArray(value) ? value : [];

  return items.slice(0, 20).flatMap((item, index) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const name = text(row.name) || text(row.title);
    if (!name) return [];
    const placeId = text(row.placeId) || text(row.googlePlaceId);

    return [{
      rank: numeric(row.rank) ?? index + 1,
      name,
      rating: numeric(row.rating) ?? null,
      reviewCount: numeric(row.reviewCount) ?? null,
      address: text(row.address),
      isOwnSchool:
        Boolean(placeId && school?.googlePlaceId && placeId === school.googlePlaceId) ||
        Boolean(school?.name && name === school.name),
    }];
  });
}

function aioStatus(score: number) {
  if (score >= 80) return "高推奨";
  if (score >= 40) return "普通";
  return "未言及";
}

function safeRankSearchLabel(keyword: DashboardTargetKeywordRecord | undefined) {
  if (!keyword) {
    return "";
  }

  try {
    return buildRankSearchLabel({
      keyword: keyword.keyword,
      location: normalizeLocationParams({
        nearestStation: keyword.nearestStation,
        municipality: keyword.municipality,
        latitude: numeric(keyword.latitude),
        longitude: numeric(keyword.longitude),
        radiusMeters: keyword.radiusMeters,
      }),
    });
  } catch {
    return [
      keyword.keyword,
      keyword.municipality,
      keyword.nearestStation,
      keyword.location,
    ].map(text).filter(Boolean).join(" / ");
  }
}

function mentionText(value: unknown, key: "chatgpt" | "gemini" | "googleAi") {
  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const responses = record.responses;

  if (responses && typeof responses === "object") {
    return text((responses as Record<string, unknown>)[key]);
  }

  const engine = record[key];

  if (engine && typeof engine === "object") {
    return text((engine as Record<string, unknown>).summary) ||
      text((engine as Record<string, unknown>).responseText);
  }

  return text(engine);
}

function dailyHistory(rows: Array<{ date: string; rank: number | null }>) {
  const latest = rows.find(row => row.date)?.date;
  if (!latest) return [];
  const start = new Date(`${latest}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 6);
  const days = new Map<string, { date: string; rank: number | null }>();
  for (const row of rows) {
    if (row.date >= start.toISOString().slice(0, 10) && !days.has(row.date)) days.set(row.date, row);
  }
  return [...days.values()].reverse();
}

export function buildDashboardRankingData({
  school,
  keywords,
  keywordRanks = [],
  keywordId,
}: {
  school: DashboardSchoolRecord | null;
  keywords: DashboardTargetKeywordRecord[];
  keywordRanks?: DashboardKeywordRankRecord[];
  keywordId?: string;
}): DashboardRankingData {
  const activeKeywords = keywords.filter((keyword) => keyword.isActive);
  const normalizedKeywords = activeKeywords.map((keyword) => ({
    id: keyword.id,
    keyword: keyword.keyword,
    location: keyword.location,
    nearestStation: keyword.nearestStation,
    municipality: keyword.municipality,
    latitude: numeric(keyword.latitude),
    longitude: numeric(keyword.longitude),
    radiusMeters: keyword.radiusMeters,
    isActive: keyword.isActive,
  }));
  const currentKeyword = keywordId ? activeKeywords.find(keyword => keyword.id === keywordId) : activeKeywords[0];
  const rankHistories = [...(currentKeyword?.rankHistories || [])].sort((a, b) =>
    new Date(b.checkedAt!).getTime() - new Date(a.checkedAt!).getTime());
  const matchingLegacyRanks = keywordRanks.filter(rank => currentKeyword &&
    rank.schoolId === currentKeyword.schoolId && rank.keyword === currentKeyword.keyword &&
    rank.searchArea === currentKeyword.location).sort((a, b) =>
    new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  const latestRankHistory = rankHistories[0];
  const latestKeywordRank = matchingLegacyRanks[0];
  // A measured null rank means out of range; it must not revive an older ranked result.
  const currentRank = latestRankHistory ? latestRankHistory.rank : latestKeywordRank?.rank ?? null;
  const previousRank = latestRankHistory ? rankHistories[1]?.rank ?? null : latestKeywordRank?.previousRank ?? null;
  const measuredAt = latestRankHistory ? dateLabel(latestRankHistory.checkedAt, true) : latestKeywordRank ? dateLabel(latestKeywordRank.measuredAt, true) : null;
  const history = dailyHistory(rankHistories.length ? rankHistories.map((rank) => ({
    date: dateLabel(rank.checkedAt),
    rank: rank.rank,
  })) : matchingLegacyRanks.map((rank) => ({
    date: dateLabel(rank.measuredAt),
    rank: rank.rank,
  })));
  const latestLogRecords = [
    ...activeKeywords.flatMap((keyword) =>
      (keyword.rankHistories || []).map((rank) => ({
        id: rank.id,
        keyword: keyword.keyword,
        rank: rank.rank,
        previousRank: null,
        searchArea: keyword.location,
        checkedAt: dateLabel(rank.checkedAt),
      })),
    ),
    ...keywordRanks.map((rank) => ({
      id: rank.id,
      keyword: rank.keyword,
      rank: rank.rank,
      previousRank: rank.previousRank,
      searchArea: rank.searchArea,
      checkedAt: dateLabel(rank.measuredAt),
    })),
  ].slice(0, 20);
  const competitors =
    normalizeCompetitorData(
      latestRankHistory ? latestRankHistory.competitorData : latestKeywordRank?.competitorData,
      school,
    );
  const aioRows = activeKeywords.map((keyword) => {
    const latestAio = keyword.aioScoreHistories?.[0] || null;

    return {
      keyword: keyword.keyword,
      chatgptScore: latestAio?.chatgptScore ?? 0,
      geminiScore: latestAio?.geminiScore ?? 0,
      googleAiScore: latestAio?.googleAiScore ?? 0,
      totalScore: latestAio?.totalScore ?? 0,
      status: aioStatus(latestAio?.totalScore ?? 0),
    };
  });
  const latestAio = activeKeywords
    .flatMap((keyword) => keyword.aioScoreHistories || [])
    .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())[0];
  const aioTrend = activeKeywords
    .flatMap((keyword) => keyword.aioScoreHistories || [])
    .sort((a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime())
    .slice(-8)
    .map((history) => ({
      date: dateLabel(history.checkedAt).slice(5) || dateLabel(history.checkedAt),
      score: history.totalScore,
    }));
  const totalScores = aioRows.length ? aioRows : [];
  const average = (key: "chatgptScore" | "geminiScore" | "googleAiScore" | "totalScore") =>
    Math.round(
      totalScores.reduce((sum, row) => sum + row[key], 0) /
        Math.max(1, totalScores.length),
    );

  return {
    school: school
      ? {
          id: school.id,
          name: school.name,
          address: fullAddress(school),
          nearestStation: currentKeyword?.nearestStation || "",
          municipality: currentKeyword?.municipality || school.city || "",
          latitude: currentKeyword ? numeric(currentKeyword.latitude) : undefined,
          longitude: currentKeyword ? numeric(currentKeyword.longitude) : undefined,
        }
      : null,
    keywords: normalizedKeywords,
    rankingLogs: latestLogRecords,
    currentKeyword: currentKeyword?.keyword || "",
    selectedKeyword: normalizedKeywords.find(keyword => keyword.id === currentKeyword?.id) || null,
    measuredAt,
    currentRank,
    previousRank,
    searchLabel: safeRankSearchLabel(currentKeyword),
    competitors,
    history,
    aio: {
      checkedAt: dateLabel(latestAio?.checkedAt),
      summary: {
        chatgptScore: average("chatgptScore"),
        geminiScore: average("geminiScore"),
        googleAiScore: average("googleAiScore"),
        totalScore: average("totalScore"),
      },
      trend: aioTrend,
      radar: [
        {
          axis: "ChatGPT",
          ownSchool: average("chatgptScore"),
          competitor: 0,
        },
        {
          axis: "Gemini",
          ownSchool: average("geminiScore"),
          competitor: 0,
        },
        {
          axis: "Google AI",
          ownSchool: average("googleAiScore"),
          competitor: 0,
        },
        {
          axis: "総合",
          ownSchool: average("totalScore"),
          competitor: 0,
        },
      ],
      keywordRows: aioRows,
      mentions: {
        chatgpt: mentionText(latestAio?.aiMentions, "chatgpt"),
        gemini: mentionText(latestAio?.aiMentions, "gemini"),
        googleAi: mentionText(latestAio?.aiMentions, "googleAi"),
      },
    },
  };
}
