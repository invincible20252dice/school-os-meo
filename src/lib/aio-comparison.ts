import { extractCompetitors, normalizeSchoolName, type AioCompetitor } from "./aio-insights";
import { availableActionCandidates, type ActionHistory, type NextAction, type NextActionRecord } from "./challenge-next-actions";
import { priorityWeights } from "./challenge-progress";
import { guideForAction } from "./action-guides";

const dayMs = 86400000;
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const metric = (v: unknown, max = Infinity, integer = false) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v)) ? v : null;
const age = (v: unknown, now: string) => { const days = (Date.parse(now) - Date.parse(str(v))) / dayMs; return Number.isFinite(days) && days >= 0 ? Math.floor(days) : null; };
const nameKey = (v: string) => normalizeSchoolName(v).replace(/溪/g, "渓").replace(/\([ぁ-ゖァ-ヺー]+\)/g, "").replace(/^学習塾/, "");
const addressKey = (v: string) => v.normalize("NFKC").replace(/日本[,、]?|〒\d{3}-?\d{4}|[\s_]/g, "");
export type GoogleObservation = {
  transient?: boolean; photoAvailable?: boolean | null; websiteUri?: string | null; googleMapsUri?: string | null;
  attributions?: Array<{ provider: string; uri: string | null }>;
  placeId: string; name: string; address: string; source: "google-places" | "google-business-profile";
  checkedAt: string; retentionUntil: string; rating: number | null; reviewCount: number | null;
  photoCount: number | null; replyRate: number | null; reviewAge: number | null; postAge: number | null;
  category: string | null; services: string[] | null; website: boolean | null;
};
export type ComparisonHistory = { status: "AVAILABLE" | "UNAVAILABLE"; document: ActionHistory };

// Read an existing, provenance-bearing snapshot only. This is not an ingestion
// license: the writer must enforce its provider's storage rights and retention.
export function readPlaceSnapshots(snapshots: Array<{ checkedAt: Date; competitorData: unknown }>, now: string): GoogleObservation[] {
  const found = new Map<string, GoogleObservation>();
  for (const snapshot of snapshots.toSorted((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())) {
    if (!Number.isFinite(snapshot.checkedAt.getTime())) continue;
    const data = obj(snapshot.competitorData), source = data.source;
    const fresh = age(snapshot.checkedAt.toISOString(), now);
    if (!["google-places", "google-business-profile"].includes(str(source)) || fresh === null || fresh >= 7 || !(Date.parse(str(data.retentionUntil)) > Date.parse(now)) || !Array.isArray(data.places)) continue;
    for (const value of data.places.slice(0, 100)) {
      const row = obj(value), id = str(row.placeId), name = str(row.name), address = str(row.address);
      if (!id || !name || !address || /^(mock|sample|simulation|competitor-|test_)/i.test(id) || found.has(id)) continue;
      const managed = source === "google-business-profile";
      found.set(id, { placeId: id, name, address, source: source as GoogleObservation["source"], checkedAt: snapshot.checkedAt.toISOString(), retentionUntil: str(data.retentionUntil),
        rating: metric(row.rating, 5), reviewCount: metric(row.reviewCount, Infinity, true),
        photoCount: managed && row.photosComplete === true ? metric(row.photoCount, Infinity, true) : null,
        replyRate: managed && row.reviewsComplete === true ? metric(row.replyRate, 100) : null,
        reviewAge: managed && row.reviewsComplete === true ? age(row.latestReviewAt, now) : null,
        postAge: managed && row.postsComplete === true ? age(row.lastPostAt, now) : null,
        category: str(row.category) || null,
        services: managed && row.servicesComplete === true && Array.isArray(row.services) ? row.services.filter((s): s is string => typeof s === "string" && Boolean(s.trim())).slice(0, 30) : null,
        website: typeof row.websiteAvailable === "boolean" ? row.websiteAvailable : null,
      });
    }
  }
  return [...found.values()];
}

export function readActionHistory(value: unknown): ComparisonHistory {
  const empty = { missions: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, completedAt: null })), nextActionHistory: [] };
  if (value === null) return { status: "AVAILABLE", document: empty };
  const data = obj(value);
  if (data.schemaVersion !== 1 || !Array.isArray(data.missions) || data.missions.length !== 7 || data.nextActionHistory !== undefined && !Array.isArray(data.nextActionHistory)) return { status: "UNAVAILABLE", document: empty };
  const missions = data.missions.map(obj), records = (data.nextActionHistory as unknown[] || []).map(obj);
  const validDate = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
  if (missions.some((m, i) => m.day !== i + 1 || m.completedAt !== null && !validDate(m.completedAt)) || records.some(r => !str(r.key) || !Number.isInteger(r.day) || Number(r.day) < 1 || Number(r.day) > 7 || !["IN_PROGRESS", "WAITING", "DEFERRED", "COMPLETED"].includes(str(r.status)) || r.status === "COMPLETED" && !validDate(r.completedAt))) return { status: "UNAVAILABLE", document: empty };
  return { status: "AVAILABLE", document: { missions: missions.map(m => ({ day: Number(m.day), completedAt: m.completedAt as string | null })), nextActionHistory: records.map(r => ({ key: str(r.key), day: Number(r.day), status: r.status as NextActionRecord["status"], completedAt: validDate(r.completedAt) ? str(r.completedAt) : null })) } };
}

export function matchAioPlace(candidate: AioCompetitor, places: GoogleObservation[], region: string, prefecture = "") {
  const names = places.filter(p => nameKey(p.name) === nameKey(candidate.name));
  const address = /(?:^|\n)_([^_\n]+)_/.exec(candidate.evidence)?.[1];
  const regional = names.filter(p => region.trim() && addressKey(p.address).includes(addressKey(region)) && (!prefecture.trim() || addressKey(p.address).includes(addressKey(prefecture))));
  const exact = address ? regional.filter(p => addressKey(p.address) === addressKey(address)) : regional;
  if (exact.length === 1) return { confidence: address ? "HIGH" as const : "MEDIUM" as const, place: exact[0], reason: address ? "店舗名・地域・住所が一致" : "校舎名を含む店舗名・地域が一致" };
  return { confidence: names.length ? "LOW" as const : "NONE" as const, place: null, reason: exact.length > 1 ? "同名の店舗が複数あり未確定" : names.length ? "地域・住所を確認できず未確定" : "一致するGoogle保存データなし" };
}
export function median(values: Array<number | null>): number | null {
  const rows = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b), middle = Math.floor(rows.length / 2);
  return rows.length ? rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2 : null;
}
const metricDefinitions = [
  ["reviewCount", "口コミ数", "件"], ["rating", "平均評価", ""], ["replyRate", "口コミ返信率", "%"],
  ["reviewAge", "最新口コミから", "日"], ["photoCount", "写真数", "枚"], ["postAge", "最新Google投稿から", "日"],
] as const;
export type ComparisonSchool = { name: string; googlePlaceId?: string | null; city?: string | null; addressLine?: string | null; prefecture?: string | null };
type Keyword = { id: string; keyword: string; municipality: string; latest: { status: string; recommended: boolean | null; brandDetected: boolean | null; score: number | null; measuredAt: string | null; createdAt: string; response: string | null; schoolName?: string } | null };
export type EvidenceAction = NextAction & { basis: "Google保存データ" | "Google現在値" | "OpenAI回答のみ"; fact: string; keywordIds: string[]; impact: number; gap: number };

export function compareAioPlaces(input: { school: ComparisonSchool; keywords: Keyword[]; places: GoogleObservation[]; history: ComparisonHistory; now: string }) {
  const { school, keywords, now, history } = input;
  const places = input.places.filter(p => Date.parse(p.retentionUntil) > Date.parse(now) && (age(p.checkedAt, now) ?? Infinity) < 7);
  const good = keywords.filter(k => k.latest?.status === "SUCCESS" && k.latest.measuredAt && k.latest.recommended !== null && k.latest.brandDetected !== null && k.latest.score !== null);
  const themes = good.map(k => ({ ...k, candidates: extractCompetitors(k.latest!.response || "", k.latest!.schoolName || school.name).slice(0, 3) }));
  const selected = new Map<string, AioCompetitor & { keywordIds: string[]; observations: Array<{ candidate: AioCompetitor; region: string }> }>();
  // Round-robin gives each keyword a chance within the five-place school cap.
  for (let i = 0; i < 3; i++) for (const theme of themes) {
    const c = theme.candidates[i]; if (!c) continue;
    const key = nameKey(c.name), previous = selected.get(key);
    const observation = { candidate: c, region: theme.municipality || school.city || "" };
    if (previous) { previous.keywordIds.push(theme.id); previous.observations.push(observation); }
    else if (selected.size < 5) selected.set(key, { ...c, keywordIds: [theme.id], observations: [observation] });
  }
  const own = school.googlePlaceId ? places.find(p => p.placeId === school.googlePlaceId && addressKey(p.address) === addressKey([school.prefecture, school.city, school.addressLine].filter(Boolean).join(""))) || null : null;
  const candidates = [...selected.values()].map(c => {
    const matches = c.observations.map(o => matchAioPlace(o.candidate, places, o.region, school.prefecture || ""));
    const ids = new Set(matches.flatMap(m => m.place ? [m.place.placeId] : []));
    const match = ids.size === 0 || ids.size === 1 && matches.every(m => m.place) ? matches[0] : { confidence: "LOW" as const, place: null, reason: "検索地域ごとの照合が未確定" };
    return { ...c, ...match };
  }).filter(c => !c.place || c.place.placeId !== school.googlePlaceId);
  const matched = [...new Map(candidates.flatMap(c => c.place ? [[c.place.placeId, c.place] as const] : [])).values()];
  const metrics = metricDefinitions.map(([key, label, unit]) => {
    const values = matched.map(p => p[key]), middle = median(values), value = own?.[key] ?? null;
    return { key, label, unit, own: value, median: middle, sampleSize: values.filter(v => v !== null).length, gap: value === null || middle === null ? null : Math.round((middle - value) * 10) / 10 };
  });
  const actions: EvidenceAction[] = [];
  const negative = good.filter(k => !k.latest!.recommended).map(k => k.id);
  const add = (key: string, day: number, fact: string, reason: string, basis: EvidenceAction["basis"], keywordIds: string[], impact: number, gap = 0) => {
    const guide = guideForAction(key); if (!guide || !keywordIds.length) return;
    const previous = actions.find(a => a.key === key);
    if (previous) { previous.keywordIds = [...new Set([...previous.keywordIds, ...keywordIds])]; return; }
    actions.push({ key, day, title: guide.title, reason, fact, basis: basis === "Google保存データ" && places.some(p => p.transient) ? "Google現在値" : basis, keywordIds, impact, gap, priority: impact >= 3 ? "S" : basis === "Google保存データ" ? "A" : "B", minutes: 10, source: "保存済みデータ", path: `/dashboard/challenge?day=${day}` });
  };
  for (const m of metrics) {
    if (m.gap === null) continue;
    const fact = `${m.label}は自塾${m.own}${m.unit}、照合済み競合中央値${m.median}${m.unit}（${m.sampleSize}店舗）です。`;
    if (m.key === "reviewCount" && m.gap > 0) add("request-reviews", 3, fact, "口コミ数に差があります。評価で選別せず、実際の利用者へ率直なお声を依頼する導線を整えましょう。", "Google保存データ", negative, 2, m.gap);
    if (m.key === "replyRate" && m.gap > 0) add("pending-replies", 4, fact, "未返信の内容を確認し、保護者の疑問に答えましょう。", "Google保存データ", negative, 3, m.gap);
    if (m.key === "photoCount" && m.gap > 0) add("check-2-photo4", 2, fact, "写真の情報量に差があります。実際の教室環境を確認して伝えましょう。", "Google保存データ", negative, 1, m.gap);
    if (m.key === "postAge" && m.gap < 0) add("publish-manual", 5, fact, "投稿の最新性に差があります。現在の教室の取り組みを伝えましょう。", "Google保存データ", negative, 2, -m.gap);
  }
  if (own?.website === false && matched.some(p => p.website === true)) add("check-7-contact", 7, "自塾には公式サイトリンクがなく、照合済み競合には登録があります。", "問い合わせ先へ迷わず進めるか、実際の導線を確認しましょう。", "Google保存データ", negative, 3);
  if (own?.services && matched.some(p => p.services?.some(s => !own.services!.includes(s)))) add("check-1-description", 1, "確認済みの掲載サービス情報に異なる項目があります。", "提供していないサービスを追加せず、実際の対象学年・指導内容を紹介文と照合しましょう。", "Google保存データ", negative, 1);
  for (const theme of themes.filter(t => negative.includes(t.id))) {
    const named = candidates.filter(c => c.keywordIds.includes(theme.id));
    const fact = `${theme.keyword}のOpenAI回答で${named.map(c => c.name).join("、") || "競合候補未抽出"}を確認。自塾のGoogle情報不足を示す事実ではありません。`;
    if (named.some(c => /自習/.test(c.evidence))) add("check-2-photo4", 2, fact, "回答由来の確認候補です。自塾の自習環境と掲載済み写真を照合してください。", "OpenAI回答のみ", [theme.id], 0);
    if (named.length) add("check-1-description", 1, fact, "回答由来の確認候補です。自塾の対象学年・指導内容が正確に伝わるか確認してください。", "OpenAI回答のみ", [theme.id], 0);
    add(named.length ? "publish-manual" : "competitor-improvement", named.length ? 5 : 6, fact, named.length ? "実際の教室の取り組みから、この検索テーマに沿った投稿内容を検討してください。" : "保存済み回答の候補を確認してください。推測による比較は行いません。", "OpenAI回答のみ", [theme.id], 0);
  }
  const available = history.status === "AVAILABLE" ? availableActionCandidates(actions, history.document, now).filter(a => {
    const at = history.document.missions[a.day - 1].completedAt;
    return !at || (age(at, now) ?? 0) >= 7;
  }) : [];
  available.sort((a, b) => b.impact - a.impact || priorityWeights[b.priority] - priorityWeights[a.priority] || b.gap - a.gap || a.minutes - b.minutes || a.key.localeCompare(b.key));
  return { status: own && matched.length ? "AVAILABLE" as const : "UNAVAILABLE" as const, own, candidates, metrics, actions: available.slice(0, 3), historyStatus: history.status, matched: matched.length,
    omitted: Math.max(0, new Set(themes.flatMap(t => t.candidates.map(c => nameKey(c.name)))).size - selected.size) };
}
