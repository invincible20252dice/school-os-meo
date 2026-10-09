import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { compareAioPlaces, matchAioPlace, type GoogleObservation } from "./aio-comparison";
import { loadAioMeasurements } from "./aio-measurement";
import { createPlacesClient, PlacesError } from "./aio-places-provider";

export const placesLimit = () => process.env.AIO_PLACES_MAX_COMPETITORS === "5" ? 5 : 1;
const day = 86400_000;
export async function refreshAioPlaces(db: PrismaClient, schoolId: string, requestId: string, client = createPlacesClient(process.env.GOOGLE_PLACES_API_KEY || "")) {
  if (!/^[a-f0-9-]{36}$/i.test(requestId)) throw new PlacesError("INVALID_REQUEST", 400);
  if (!process.env.GOOGLE_PLACES_API_KEY?.trim()) throw new PlacesError("NOT_CONFIGURED");
  const data = await loadAioMeasurements(db, schoolId);
  if (!data.school?.name) throw new PlacesError("NO_MATCH", 404);
  const school = data.school;
  const comparison = compareAioPlaces({ school: { ...school, name: school.name! }, keywords: data.keywords.map(k => ({ ...k, latest: k.latest ? { ...k.latest, createdAt: k.latest.createdAt.toISOString(), measuredAt: k.latest.measuredAt?.toISOString() || null } : null })), places: [], history: data.comparisonContext.history, now: data.comparisonContext.asOf });
  const candidates = comparison.candidates.slice(0, placesLimit());
  if (!candidates.length) throw new PlacesError("NO_MATCH", 404);
  const reservedCalls = candidates.length * 2 + (school.googlePlaceId ? 1 : 0);
  const where = { schoolId_requestId: { schoolId, requestId } };
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"aio-places:" + schoolId}, 0))`;
    if (await tx.aioPlacesRequest.findUnique({ where })) throw new PlacesError("ALREADY_REQUESTED", 409);
    const recent = await tx.aioPlacesRequest.findMany({ where: { schoolId, createdAt: { gte: new Date(Date.now() - day) } } });
    if (recent.some(r => r.createdAt.getTime() > Date.now() - 600_000)) throw new PlacesError("COOLDOWN", 429);
    // Reserve worst-case calls, including failures/crashes, without refund/retry races.
    if (recent.reduce((n, r) => n + r.reservedCalls, 0) + reservedCalls > 11) throw new PlacesError("DAILY_LIMIT", 429);
    await tx.aioPlacesRequest.create({ data: { schoolId, requestId, reservedCalls } });
  });
  const places: GoogleObservation[] = [], failures: Array<{ candidate: string; code: string }> = [];
  const codeFor = (e: unknown) => e instanceof PlacesError ? e.code : "STORAGE_FAILED";
  try {
    for (const candidate of candidates) {
      const candidateKey = createHash("sha256").update(JSON.stringify([candidate.name, school.prefecture, candidate.observations])).digest("hex");
      const linkWhere = { schoolId_candidateKey: { schoolId, candidateKey } };
      try {
        const saved = await db.aioPlaceLink.findUnique({ where: linkWhere });
        let id = saved && Date.now() - saved.identifiedAt.getTime() < 365 * day ? saved.placeId : null;
        if (!id) {
          const result = await client.search(`${candidate.name} ${school.prefecture || ""} ${candidate.observations[0].region}`.trim());
          const matches = candidate.observations.map(o => matchAioPlace(o.candidate, result, o.region, school.prefecture || ""));
          if (!matches.every(m => m.place) || new Set(matches.map(m => m.place?.placeId)).size !== 1) throw new PlacesError(result.length ? "AMBIGUOUS" : "NO_MATCH");
          id = matches[0].place!.placeId;
        }
        const current = await client.details(id);
        if (!candidate.observations.every(o => matchAioPlace(o.candidate, [current], o.region, school.prefecture || "").place) || id === school.googlePlaceId) throw new PlacesError("AMBIGUOUS");
        // Explicit allowlist: never pass provider objects to a database write.
        await db.aioPlaceLink.upsert({ where: linkWhere, create: { schoolId, candidateKey, placeId: id }, update: { placeId: id, identifiedAt: new Date() } });
        if (!places.some(p => p.placeId === id)) places.push(current);
      } catch (e) {
        const code = codeFor(e); failures.push({ candidate: candidate.name, code });
        if (!["NO_MATCH", "AMBIGUOUS", "INVALID_ID"].includes(code)) break;
      }
    }
    if (places.length && school.googlePlaceId) {
      try { places.push(await client.details(school.googlePlaceId)); }
      catch (e) { failures.push({ candidate: school.name!, code: codeFor(e) }); }
    }
  } catch { failures.push({ candidate: "", code: "STORAGE_FAILED" }); }
  await db.aioPlacesRequest.update({ where, data: { actualCalls: client.requests(), status: failures.length ? places.length ? "PARTIAL" : "FAILED" : "SUCCESS", errorCode: failures[0]?.code || null, completedAt: new Date() } });
  return { places, failures, requests: client.requests(), reservedCalls, competitorLimit: placesLimit(), asOf: new Date().toISOString() };
}
