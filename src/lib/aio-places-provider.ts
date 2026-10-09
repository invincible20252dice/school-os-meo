import type { GoogleObservation } from "./aio-comparison";

export const SEARCH_MASK = "places.id,places.displayName,places.formattedAddress";
export const DETAILS_MASK = "id,displayName,formattedAddress,primaryType,rating,userRatingCount,photos,websiteUri,googleMapsUri,attributions";
export class PlacesError extends Error {
  constructor(public readonly code: string, public readonly status = 503) { super(code); }
}
export const placesMessages: Record<string, string> = {
  NOT_CONFIGURED: "設定が必要（Places APIキー）", API_DISABLED: "Places API (New)の有効化が必要です。",
  BILLING_DISABLED: "Google Cloudの課金設定を確認してください。", AUTH_FAILED: "APIキーの認証・制限・権限を確認してください。",
  RATE_LIMIT: "APIのリクエスト制限に達しました。", QUOTA: "APIの利用枠が不足しています。",
  TIMEOUT: "Google APIが時間内に応答しませんでした。", PROVIDER_FAILED: "Google APIから取得できませんでした。",
  INVALID_RESPONSE: "Googleからの情報を確認できませんでした。", INVALID_ID: "Place IDを確認してください。",
  NO_MATCH: "一致する店舗候補がありません。", AMBIGUOUS: "店舗の名称・地域・校舎を確定できませんでした。",
  ALREADY_REQUESTED: "この取得操作は受付済みです。自動で再取得は行いません。",
  COOLDOWN: "この校舎は取得後10分間、再取得できません。", DAILY_LIMIT: "この校舎の24時間の取得上限に達しました。",
  STORAGE_FAILED: "Place ID保存先とDB接続の設定を確認してください。", INVALID_REQUEST: "取得操作を確認してください。",
};
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export const validPlaceId = (id: string) => /^[\w-]{1,255}$/.test(id);
const number = (v: unknown, max = Infinity, integer = false) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v)) ? v : null;
function safeUrl(value: unknown) {
  try { const u = new URL(text(value)); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
function observation(value: unknown): GoogleObservation {
  const p = obj(value), id = text(p.id), name = text(obj(p.displayName).text), address = text(p.formattedAddress);
  if (!validPlaceId(id) || !name || !address) throw new PlacesError("INVALID_RESPONSE");
  const now = Date.now();
  return { placeId: id, name, address, source: "google-places", transient: true,
    checkedAt: new Date(now).toISOString(), retentionUntil: new Date(now + 300_000).toISOString(),
    rating: number(p.rating, 5), reviewCount: number(p.userRatingCount, Infinity, true),
    photoCount: null, photoAvailable: Array.isArray(p.photos) && p.photos.length > 0 ? true : null,
    replyRate: null, reviewAge: null, postAge: null, services: null,
    category: text(p.primaryType) || null, website: safeUrl(p.websiteUri) ? true : p.websiteUri == null ? false : null,
    websiteUri: safeUrl(p.websiteUri), googleMapsUri: safeUrl(p.googleMapsUri),
    attributions: (Array.isArray(p.attributions) ? p.attributions : []).flatMap(value => {
      const a = obj(value), provider = text(a.provider), uri = safeUrl(a.providerUri);
      return provider ? [{ provider, uri }] : [];
    }),
  };
}
function errorCode(status: number, value: unknown) {
  const e = obj(obj(value).error), details = Array.isArray(e.details) ? e.details : [];
  const reasons = details.map(d => text(obj(d).reason));
  const known: Record<string, string> = { SERVICE_DISABLED: "API_DISABLED", BILLING_DISABLED: "BILLING_DISABLED", API_KEY_INVALID: "AUTH_FAILED", RATE_LIMIT_EXCEEDED: "RATE_LIMIT", QUOTA_EXCEEDED: "QUOTA" };
  for (const reason of reasons) if (known[reason]) return known[reason];
  return status === 429 ? "RATE_LIMIT" : status === 401 || status === 403 ? "AUTH_FAILED" : status === 404 ? "INVALID_ID" : "PROVIDER_FAILED";
}

// This client lives for one explicit UI request only. No persistent content cache.
export function createPlacesClient(key: string, http: typeof fetch = fetch) {
  let requests = 0;
  const details = new Map<string, Promise<GoogleObservation>>();
  async function call(path: string, mask: string, body?: unknown) {
    if (!key.trim()) throw new PlacesError("NOT_CONFIGURED");
    if (requests >= 11) throw new PlacesError("DAILY_LIMIT", 429);
    requests++;
    try {
      const response = await http(`https://places.googleapis.com/v1/${path}`, { method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(8000), headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": mask, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new PlacesError(errorCode(response.status, data));
      if (data === null || typeof data !== "object" || Array.isArray(data)) throw new PlacesError("INVALID_RESPONSE");
      return data;
    } catch (error) {
      if (error instanceof PlacesError) throw error;
      throw new PlacesError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "TIMEOUT" : "PROVIDER_FAILED");
    }
  }
  return {
    requests: () => requests,
    async search(query: string) {
      const data = obj(await call("places:searchText", SEARCH_MASK, { textQuery: query, pageSize: 3, languageCode: "ja", regionCode: "JP" }));
      if (data.places === undefined) return [];
      if (!Array.isArray(data.places)) throw new PlacesError("INVALID_RESPONSE");
      return data.places.slice(0, 3).map(observation);
    },
    async details(id: string) {
      if (!validPlaceId(id)) throw new PlacesError("INVALID_ID");
      if (!details.has(id)) details.set(id, (async () => {
        const result = observation(await call(`places/${encodeURIComponent(id)}?languageCode=ja`, DETAILS_MASK));
        if (result.placeId !== id) throw new PlacesError("INVALID_RESPONSE");
        return result;
      })());
      return details.get(id)!;
    },
  };
}
