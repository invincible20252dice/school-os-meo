import type { PrismaClient } from "@prisma/client";
import { AIO_MODEL, AIO_PROVIDER, AIO_VERSION, AioProviderError, measureOpenAi } from "./aio-provider";

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
  BUSY: "計測中、または直前の計測から1分以内です。",
  DAILY_LIMIT: "検証期間中は1校舎につき24時間で5回までです。",
  PILOT_LIMIT: "最初のキーワードの実測検証が完了するまで、別キーワードの計測は停止しています。",
  NOT_FOUND: "有効な登録キーワードが見つかりません。",
  INVALID_REQUEST: "キーワードとリクエストIDを確認してください。",
  SAVE_FAILED: "結果を保存できませんでした。再取得して状態を確認してください。",
};
export const measurementScope = { provider: AIO_PROVIDER, source: AIO_VERSION };

export async function loadAioMeasurements(db: PrismaClient, schoolId: string) {
  const keywords = await db.targetKeyword.findMany({
    where: { schoolId, isActive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, keyword: true, municipality: true, nearestStation: true,
      aioMeasurements: { where: measurementScope, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
  });
  const first = await db.aioMeasurement.findFirst({ where: { schoolId, ...measurementScope, status: { not: "CONFIG_REQUIRED" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { keywordId: true } });
  return { configured: Boolean(process.env.OPENAI_API_KEY?.trim()), pilotKeywordId: first?.keywordId || null,
    keywords: keywords.map(({ aioMeasurements, ...keyword }) => ({ ...keyword, latest: aioMeasurements[0] || null })),
  };
}

export async function runAioMeasurement(db: PrismaClient, schoolId: string, keywordId: string, requestId: string, provider = measureOpenAi) {
  if (!keywordId || keywordId.length > 200 || !/^[a-f0-9-]{36}$/i.test(requestId)) throw new AioRequestError("INVALID_REQUEST", 400);
  const reservation = await db.$transaction(async tx => {
    // Serialize reservations only, never hold a database transaction during provider calls.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"aio:" + schoolId}, 0))`;
    const keyword = await tx.targetKeyword.findFirst({ where: { id: keywordId, schoolId, isActive: true }, include: { school: { select: { name: true } } } });
    if (!keyword) throw new AioRequestError("NOT_FOUND", 404);
    const prior = await tx.aioMeasurement.findUnique({ where: { schoolId_requestId: { schoolId, requestId } } });
    if (prior) {
      if (prior.keywordId !== keywordId) throw new AioRequestError("INVALID_REQUEST", 409);
      return { record: prior, execute: false };
    }
    const first = await tx.aioMeasurement.findFirst({ where: { schoolId, ...measurementScope, status: { not: "CONFIG_REQUIRED" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (first && first.keywordId !== keywordId) throw new AioRequestError("PILOT_LIMIT", 409);
    const now = Date.now();
    const recent = await tx.aioMeasurement.findMany({ where: { schoolId, ...measurementScope, createdAt: { gte: new Date(now - 86400_000) } } });
    if (recent.some(row => row.createdAt.getTime() > now - 60_000 || (row.status === "RUNNING" && row.createdAt.getTime() > now - 300_000))) throw new AioRequestError("BUSY", 409);
    if (recent.filter(row => row.status !== "CONFIG_REQUIRED").length >= 5) throw new AioRequestError("DAILY_LIMIT", 429);
    const configured = Boolean(process.env.OPENAI_API_KEY?.trim());
    const record = await tx.aioMeasurement.create({ data: {
      schoolId, keywordId, requestId, ...measurementScope, model: AIO_MODEL,
      status: configured ? "RUNNING" : "CONFIG_REQUIRED", errorCode: configured ? null : "NOT_CONFIGURED",
      schoolName: keyword.school.name,
      query: JSON.stringify({ municipality: keyword.municipality, nearestStation: keyword.nearestStation, keyword: keyword.keyword }) + "\nこの地域と検索語に合う、おすすめの学習塾を理由と出典付きで教えてください。",
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
    return db.aioMeasurement.update({ where: { id: record.id }, data: { status: code === "NOT_CONFIGURED" ? "CONFIG_REQUIRED" : "FAILED", errorCode: code } });
  }
  try {
    return await db.aioMeasurement.update({ where: { id: record.id }, data: { ...result, status: "SUCCESS", errorCode: null, measuredAt: new Date() } });
  } catch { throw new AioRequestError("SAVE_FAILED", 500); }
}
