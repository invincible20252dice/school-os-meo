import type { PrismaClient } from "@prisma/client";
import { AIO_MODEL, AIO_PROVIDER, AIO_VERSION, AioProviderError, measureOpenAi } from "./aio-provider";
import { aioMetadata } from "./aio-audit";
import { savedAioCompetitors } from "./aio-context";
import { readActionHistory, readPlaceSnapshots } from "./aio-comparison";

export class AioRequestError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}
export const aioMessages: Record<string, string> = {
  NOT_CONFIGURED: "設定が必要", DB_NOT_CONFIGURED: "設定が必要（DB接続）",
  RATE_LIMIT: "APIの利用制限に達しました。時間をおいて再計測してください。",
  QUOTA: "APIの利用枠が不足しています。利用枠を確認してください。",
  AUTH_FAILED: "APIの認証・権限を確認してください。",
  TIMEOUT: "APIが時間内に応答しませんでした。",
  PROVIDER_FAILED: "APIから回答を取得できませんでした。",
  INVALID_RESPONSE: "検索結果または推奨判定を確認できませんでした。",
  INTERRUPTED: "計測が中断されました。再計測してください。",
  BUSY: "この校舎で別の計測を実行中です。再取得して確認してください。",
  DAILY_LIMIT: "検証期間中は1校舎につき24時間で5回までです。",
  NOT_FOUND: "有効な登録キーワードが見つかりません。",
  INVALID_REQUEST: "キーワードとリクエストIDを確認してください。",
  SAVE_FAILED: "結果を保存できませんでした。再取得して状態を確認してください。",
};
export const measurementScope = { provider: AIO_PROVIDER, source: AIO_VERSION };

export async function loadAioMeasurements(db: PrismaClient, schoolId: string) {
  const keywords = await db.targetKeyword.findMany({
    where: { schoolId, isActive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, keyword: true, municipality: true, nearestStation: true,
      school: { select: { name: true, googlePlaceId: true, prefecture: true, city: true, addressLine: true, websiteUrl: true, schoolSetting: { select: { googleConnected: true } }, challenge: { select: { document: true } } } },
      rankHistories: { orderBy: { checkedAt: "desc" }, take: 10, select: { checkedAt: true, competitorData: true } },
      aioMeasurements: { where: measurementScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51 },
    },
  });
  const selectedSchool = keywords.at(0)?.school;
  const { challenge, ...school } = selectedSchool || {} as NonNullable<typeof selectedSchool>;
  const asOf = new Date().toISOString();
  return { configured: Boolean(process.env.OPENAI_API_KEY?.trim()), pilotKeywordId: null,
    school: keywords.at(0)?.school ? school : null,
    comparisonContext: { asOf, places: readPlaceSnapshots(keywords.flatMap(k => k.rankHistories || []), asOf).filter(p => p.source !== "google-places"), history: readActionHistory(challenge?.document ?? null) },
    competitors: savedAioCompetitors(keywords.flatMap(k => k.rankHistories || [])),
    keywords: keywords.map(({ aioMeasurements, school: _school, rankHistories: _ranks, ...keyword }) => {
      const history = aioMeasurements.slice(0, 50).map(record => {
        const { sources, usage } = aioMetadata(record.citations);
        return { ...record, citations: sources, usage };
      });
      return { ...keyword, latest: history[0] || null,
        history: history.map(r => ({ ...r, query: "", response: null, evidence: null, citations: [] })),
        historyTruncated: aioMeasurements.length > 50 };
    }),
  };
}

export async function loadAioMeasurementDetail(db: PrismaClient, schoolId: string, id: string) {
  if (!id || id.length > 200) throw new AioRequestError("INVALID_REQUEST", 400);
  const record = await db.aioMeasurement.findFirst({ where: { id, schoolId, ...measurementScope } });
  if (!record) throw new AioRequestError("NOT_FOUND", 404);
  const { sources, usage } = aioMetadata(record.citations);
  return { ...record, citations: sources, usage };
}

export async function runAioMeasurement(db: PrismaClient, schoolId: string, keywordId: string, requestId: string, provider = measureOpenAi) {
  if (!keywordId || keywordId.length > 200 || !/^[a-f0-9-]{36}$/i.test(requestId)) throw new AioRequestError("INVALID_REQUEST", 400);
  const reservation = await db.$transaction(async tx => {
    // Serialize reservations only, never hold a database transaction during provider calls.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"aio:" + schoolId}, 0))`;
    const keyword = await tx.targetKeyword.findFirst({ where: { id: keywordId, schoolId, isActive: true }, include: { school: { select: { name: true, prefecture: true, city: true, addressLine: true } } } });
    if (!keyword) throw new AioRequestError("NOT_FOUND", 404);
    const prior = await tx.aioMeasurement.findUnique({ where: { schoolId_requestId: { schoolId, requestId } } });
    if (prior) {
      if (prior.keywordId !== keywordId) throw new AioRequestError("INVALID_REQUEST", 409);
      return { record: prior, execute: false };
    }
    const now = Date.now();
    const recent = await tx.aioMeasurement.findMany({ where: { schoolId, ...measurementScope, createdAt: { gte: new Date(now - 86400_000) } } });
    const duplicate = recent.filter(row => row.keywordId === keywordId && row.createdAt.getTime() > now - 600_000).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
    if (duplicate) return { record: duplicate, execute: false };
    if (recent.some(row => row.status === "RUNNING" && row.createdAt.getTime() > now - 300_000)) throw new AioRequestError("BUSY", 409);
    if (recent.filter(row => row.status !== "CONFIG_REQUIRED").length >= 5) throw new AioRequestError("DAILY_LIMIT", 429);
    const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
    const record = await tx.aioMeasurement.create({ data: {
      schoolId, keywordId, requestId, ...measurementScope, model: AIO_MODEL,
      status: configured ? "RUNNING" : "CONFIG_REQUIRED", errorCode: configured ? null : "NOT_CONFIGURED",
      schoolName: keyword.school.name,
      query: buildAioQuery(keyword),
    } });
    return { record, execute: configured };
  });
  if (!reservation.execute) return reservation.record;
  const record = reservation.record;
  let result;
  try {
    result = await provider({ query: record.query, schoolName: record.schoolName });
  } catch (error) {
    const code = error instanceof AioProviderError ? error.code : "PROVIDER_FAILED";
    return db.aioMeasurement.update({ where: { id: record.id }, data: { status: code === "NOT_CONFIGURED" ? "CONFIG_REQUIRED" : "FAILED", errorCode: code,
      ...(error instanceof AioProviderError && error.audit ? { citations: { version: 2, sources: [], usage: { ...error.audit } } } : {}),
    } });
  }
  try {
    const { usage, ...answer } = result;
    return await db.aioMeasurement.update({ where: { id: record.id }, data: { ...answer,
      citations: usage ? { version: 2, sources: answer.citations, usage: { ...usage } } : answer.citations,
      status: "SUCCESS", errorCode: null, measuredAt: new Date() } });
  } catch { throw new AioRequestError("SAVE_FAILED", 500); }
}

export function buildAioQuery(keyword: { keyword: string; municipality: string; nearestStation: string; school: { prefecture?: string | null; city?: string | null; addressLine?: string | null } }) {
  const region = [keyword.school.prefecture, keyword.municipality || keyword.school.city, keyword.nearestStation].filter(Boolean).join("・");
  // Do not send the school name or street address: these identify and bias retrieval.
  return `${region ? region + "周辺で、" : ""}「${keyword.keyword}」を調べている生徒・保護者向けに、この検索意図に合う学習塾・予備校を、おすすめする理由と出典付きで教えてください。地域・学年・サービスの条件を勝手に追加せず、不明な点は不明としてください。`;
}
