import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { refreshAioPlaces, placesLimit } from "./aio-places";
import { loadAioMeasurements } from "./aio-measurement";
import { createPlacesClient, PlacesError } from "./aio-places-provider";
import { readActionHistory } from "./aio-comparison";
vi.mock("./aio-measurement", () => ({ loadAioMeasurements: vi.fn() }));
const current = (id = "competitor", name = "検証予備校") => ({ id, displayName: { text: name }, formattedAddress: "検証県検証市1", rating: 4.5, userRatingCount: 31 });
let db: ReturnType<typeof database>;
let http: ReturnType<typeof vi.fn>;
function database() {
  const value = {
    $executeRaw: vi.fn(), $transaction: vi.fn(),
    aioPlaceLink: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
    aioPlacesRequest: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
  };
  value.$transaction.mockImplementation(fn => fn(value)); return value;
}
function fixture(count = 1) {
  return { configured: true, pilotKeywordId: null, school: { name: "自塾", googlePlaceId: "own", prefecture: "検証県", city: "検証市", addressLine: "1" },
    comparisonContext: { asOf: new Date().toISOString(), places: [], history: readActionHistory(null) }, competitors: [],
    keywords: Array.from({ length: count }, (_, i) => ({ id: `k${i}`, keyword: "塾", municipality: "検証市", nearestStation: "", history: [], historyTruncated: false,
      latest: { status: "SUCCESS", response: `おすすめの学習塾\n1. **検証予備校${i || ""}**\n大学受験を支援します。`, recommended: false, brandDetected: false, score: 0, measuredAt: new Date(), createdAt: new Date() } })) };
}
const run = () => refreshAioPlaces(db as unknown as PrismaClient, "school-a", randomUUID(), createPlacesClient("test-only", http));
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-only"); vi.stubEnv("AIO_PLACES_MAX_COMPETITORS", "1");
  db = database();
  vi.mocked(loadAioMeasurements).mockResolvedValue(fixture() as never);
  http = vi.fn().mockImplementation(async (url, init) => new Response(JSON.stringify(url.includes(":searchText") ? { places: [current()] } : url.includes("/own?") ? current("own", "自塾") : current())));
});
afterEach(() => vi.unstubAllEnvs());
it("stores IDs and operational metadata only, using existing candidates and one competitor by default", async () => {
  const result = await run();
  expect(result).toMatchObject({ requests: 3, reservedCalls: 3, failures: [], competitorLimit: 1 });
  expect(result.places).toHaveLength(2);
  expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  const write = db.aioPlaceLink.upsert.mock.calls[0][0];
  expect(Object.keys(write.create).sort()).toEqual(["candidateKey", "placeId", "schoolId"]);
  expect(write.create).toMatchObject({ schoolId: "school-a", placeId: "competitor", candidateKey: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(JSON.stringify([write, db.aioPlacesRequest.create.mock.calls, db.aioPlacesRequest.update.mock.calls])).not.toMatch(/rating|userRatingCount|検証県|検証予備校|response|4\.5/);
  expect(db.aioPlacesRequest.update.mock.calls[0][0].data).toMatchObject({ status: "SUCCESS", actualCalls: 3 });
});
it("reuses only fresh saved IDs, still fetches current details and revalidates identity", async () => {
  db.aioPlaceLink.findUnique.mockResolvedValue({ placeId: "competitor", identifiedAt: new Date() });
  expect((await run()).requests).toBe(2);
  expect(http.mock.calls.some(c => c[0].includes(":searchText"))).toBe(false);
  http.mockImplementation(async () => new Response(JSON.stringify(current("competitor", "別の校舎"))));
  expect((await run()).failures).toEqual([{ candidate: "検証予備校", code: "AMBIGUOUS" }]);
});
it("re-resolves an ID older than a year on explicit refresh", async () => {
  db.aioPlaceLink.findUnique.mockResolvedValue({ placeId: "old", identifiedAt: new Date(0) });
  expect((await run()).requests).toBe(3);
});
it.each(["NO_MATCH", "AMBIGUOUS", "QUOTA"])("does not manufacture numeric success for %s", async code => {
  http.mockImplementation(async () => new Response(JSON.stringify(code === "QUOTA" ? { error: { details: [{ reason: "QUOTA_EXCEEDED" }] } } : { places: code === "NO_MATCH" ? [] : [current(), current("other")] }), { status: code === "QUOTA" ? 429 : 200 }));
  const result = await run();
  expect(result.places).toEqual([]); expect(result.failures[0].code).toBe(code);
  expect(result.requests).toBe(1); expect(db.aioPlaceLink.upsert).not.toHaveBeenCalled();
  expect(db.aioPlacesRequest.update.mock.calls[0][0].data.status).toBe("FAILED");
});
it.each(["ALREADY_REQUESTED", "COOLDOWN", "DAILY_LIMIT"])("rejects %s before Google calls", async code => {
  if (code === "ALREADY_REQUESTED") db.aioPlacesRequest.findUnique.mockResolvedValue({});
  else db.aioPlacesRequest.findMany.mockResolvedValue([{ createdAt: new Date(Date.now() - (code === "COOLDOWN" ? 0 : 3600_000)), reservedCalls: 11 }]);
  await expect(run()).rejects.toMatchObject({ code }); expect(http).not.toHaveBeenCalled();
});
it("keeps failures without raw exception text and never persists a content-bearing response", async () => {
  db.aioPlaceLink.upsert.mockRejectedValue(new Error("secret rating address"));
  const result = await run();
  expect(result.failures[0].code).toBe("STORAGE_FAILED"); expect(result.places).toEqual([]);
  expect(JSON.stringify(db.aioPlacesRequest.update.mock.calls)).not.toContain("secret");
});
it("returns partial when own details fail and leaves existing AIO measurements untouched", async () => {
  http.mockImplementation(async url => new Response(JSON.stringify(url.includes(":searchText") ? { places: [current()] } : url.includes("/own?") ? {} : current()), { status: url.includes("/own?") ? 404 : 200 }));
  expect((await run()).failures).toEqual([{ candidate: "自塾", code: "INVALID_ID" }]);
  expect(db.aioPlacesRequest.update.mock.calls[0][0].data.status).toBe("PARTIAL");
});
it("fails closed on configuration, no school, no candidates and invalid request", async () => {
  await expect(refreshAioPlaces(db as never, "a", "bad")).rejects.toBeInstanceOf(PlacesError);
  vi.stubEnv("GOOGLE_PLACES_API_KEY", ""); await expect(run()).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-only");
  vi.mocked(loadAioMeasurements).mockResolvedValue({ school: null } as never); await expect(run()).rejects.toMatchObject({ code: "NO_MATCH" });
  vi.mocked(loadAioMeasurements).mockResolvedValue(fixture(0) as never); await expect(run()).rejects.toMatchObject({ code: "NO_MATCH" });
  expect(http).not.toHaveBeenCalled();
});
it("caps at five competitors and eleven calls after explicit pilot expansion", async () => {
  vi.stubEnv("AIO_PLACES_MAX_COMPETITORS", "500"); expect(placesLimit()).toBe(1);
  vi.stubEnv("AIO_PLACES_MAX_COMPETITORS", "5"); expect(placesLimit()).toBe(5);
  vi.mocked(loadAioMeasurements).mockResolvedValue(fixture(8) as never);
  const names = new Map<string, string>();
  http.mockImplementation(async (url, init) => {
    if (url.includes(":searchText")) { const name = JSON.parse(init.body).textQuery.split(" ")[0], id = `place${names.size}`; names.set(id, name); return new Response(JSON.stringify({ places: [current(id, name)] })); }
    const id = /places\/(\w+)/.exec(url)![1]; return new Response(JSON.stringify(current(id, names.get(id) || "自塾")));
  });
  const result = await run(); expect(result.requests).toBe(11); expect(result.places).toHaveLength(6); expect(db.aioPlaceLink.upsert).toHaveBeenCalledTimes(5);
});
