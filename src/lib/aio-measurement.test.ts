import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildAioQuery, loadAioMeasurements, loadAioMeasurementDetail, runAioMeasurement } from "./aio-measurement";
import { AioProviderError } from "./aio-provider";
const requestId = "00000000-0000-4000-8000-000000000001";
const mock = {
  $executeRaw: vi.fn(), $transaction: vi.fn(),
  targetKeyword: { findFirst: vi.fn(), findMany: vi.fn() },
  aioMeasurement: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};
const db = mock as unknown as PrismaClient;
const result = { model: "gpt-4.1-mini", response: "別の塾", citations: [], evidence: "", brandDetected: false, recommended: false, score: 0 };
const run = (provider = vi.fn().mockResolvedValue(result), keyword = "k", id = requestId) => runAioMeasurement(db, "s", keyword, id, provider);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("OPENAI_API_KEY", "unit-test-only");
  mock.$transaction.mockImplementation(fn => fn(mock));
  mock.targetKeyword.findFirst.mockResolvedValue({ id: "k", schoolId: "s", school: { name: "検証塾" }, municipality: "市", nearestStation: "駅", keyword: "塾" });
  mock.aioMeasurement.findUnique.mockResolvedValue(null); mock.aioMeasurement.findFirst.mockResolvedValue(null);
  mock.aioMeasurement.findMany.mockResolvedValue([]);
  mock.aioMeasurement.create.mockImplementation(({ data }) => ({ ...data, id: "m", score: null, recommended: null, brandDetected: null, measuredAt: null }));
  mock.aioMeasurement.update.mockImplementation(({ data }) => ({ ...data, id: "m" }));
});
afterEach(() => vi.unstubAllEnvs());
it("reserves before provider use and saves true zero only on success", async () => {
  const provider = vi.fn().mockResolvedValue(result);
  expect(await run(provider)).toMatchObject({ status: "SUCCESS", score: 0, measuredAt: expect.any(Date) });
  expect(mock.aioMeasurement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "RUNNING", source: "openai-search-v1", keywordId: "k", schoolId: "s" }) });
  expect(mock.aioMeasurement.create.mock.invocationCallOrder[0]).toBeLessThan(provider.mock.invocationCallOrder[0]);
  expect(mock.targetKeyword.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "k", schoolId: "s", isActive: true } }));
});
it("stores configuration state without inventing a measurement", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const provider = vi.fn();
  expect(await run(provider)).toMatchObject({ status: "CONFIG_REQUIRED", errorCode: "NOT_CONFIGURED", score: null, measuredAt: null });
  expect(provider).not.toHaveBeenCalled();
});
it.each(["RATE_LIMIT", "QUOTA", "TIMEOUT", "NOT_CONFIGURED"] as const)("stores %s separately from zero", async code => {
  const value = await run(vi.fn().mockRejectedValue(new AioProviderError(code)));
  expect(value).toMatchObject({ status: code === "NOT_CONFIGURED" ? "CONFIG_REQUIRED" : "FAILED", errorCode: code });
  expect(mock.aioMeasurement.update).toHaveBeenCalledWith({ where: { id: "m" }, data: { status: code === "NOT_CONFIGURED" ? "CONFIG_REQUIRED" : "FAILED", errorCode: code } });
});
it("redacts unknown errors", async () => {
  expect(await run(vi.fn().mockRejectedValue(new Error("secret")))).toMatchObject({ errorCode: "PROVIDER_FAILED" });
});
it.each(["RUNNING", "SUCCESS", "FAILED", "CONFIG_REQUIRED"])("reuses a %s reservation without additional spending or writes", async status => {
  mock.aioMeasurement.findUnique.mockResolvedValue({ id: "existing", keywordId: "k", status });
  const provider = vi.fn();
  expect(await run(provider)).toMatchObject({ id: "existing" });
  expect(provider).not.toHaveBeenCalled();
  expect(mock.aioMeasurement.create).not.toHaveBeenCalled();
  expect(mock.aioMeasurement.update).not.toHaveBeenCalled();
  expect(mock.aioMeasurement.updateMany).not.toHaveBeenCalled();
});
it("does not rewrite older interrupted measurements when reserving a new one", async () => {
  mock.aioMeasurement.findMany.mockResolvedValue([{ id: "older", status: "RUNNING", createdAt: new Date(Date.now() - 600_000) }]);
  await run();
  expect(mock.aioMeasurement.updateMany).not.toHaveBeenCalled();
  expect(mock.aioMeasurement.update).toHaveBeenCalledTimes(1);
  expect(mock.aioMeasurement.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "m" } }));
});
it("rejects request reuse for a different keyword", async () => {
  mock.aioMeasurement.findUnique.mockResolvedValue({ keywordId: "other" });
  await expect(run()).rejects.toMatchObject({ status: 409 });
});
it("rejects absent or foreign-school keywords without provider use", async () => {
  mock.targetKeyword.findFirst.mockResolvedValue(null);
  await expect(run()).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(mock.aioMeasurement.create).not.toHaveBeenCalled();
});
it.each([["", requestId], ["k", "bad"], ["k".repeat(201), requestId]])("rejects invalid inputs", async (k, id) => {
  await expect(run(undefined, k, id)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(mock.$transaction).not.toHaveBeenCalled();
});
it("allows another owned keyword after the accepted live pilot", async () => {
  mock.aioMeasurement.findFirst.mockResolvedValue({ keywordId: "first" });
  expect(await run()).toMatchObject({ status: "SUCCESS" });
});
it.each([{ status: "RUNNING", age: 1000 }, { status: "RUNNING", age: 120000 }])("limits concurrent requests", async row => {
  mock.aioMeasurement.findMany.mockResolvedValue([{ ...row, createdAt: new Date(Date.now() - row.age) }]);
  await expect(run()).rejects.toMatchObject({ code: "BUSY" });
});
it("caps paid daily attempts but excludes configuration-only attempts", async () => {
  const rows = Array.from({ length: 5 }, () => ({ status: "FAILED", createdAt: new Date(Date.now() - 600000) }));
  mock.aioMeasurement.findMany.mockResolvedValue(rows);
  await expect(run()).rejects.toMatchObject({ code: "DAILY_LIMIT" });
  mock.aioMeasurement.findMany.mockResolvedValue(rows.map(row => ({ ...row, status: "CONFIG_REQUIRED" })));
  expect(await run()).toMatchObject({ status: "SUCCESS" });
});
it("does not claim success if the final DB write fails", async () => {
  mock.aioMeasurement.update.mockRejectedValue(new Error("secret"));
  await expect(run()).rejects.toMatchObject({ code: "SAVE_FAILED" });
});
it("reads only new measurements scoped to the school and shows absent separately", async () => {
  mock.targetKeyword.findMany.mockResolvedValue([{ id: "k", aioMeasurements: [{ status: "FAILED" }] }, { id: "k2", aioMeasurements: [] }]);
  mock.aioMeasurement.findFirst.mockResolvedValue({ keywordId: "k" });
  expect(await loadAioMeasurements(db, "s")).toMatchObject({ configured: true, pilotKeywordId: null, keywords: [{ latest: { status: "FAILED" } }, { latest: null }] });
  expect(mock.targetKeyword.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "s", isActive: true } }));
  vi.stubEnv("OPENAI_API_KEY", ""); mock.aioMeasurement.findFirst.mockResolvedValue(null);
  expect(await loadAioMeasurements(db, "s")).toMatchObject({ configured: false, pilotKeywordId: null });
});
it.each(["SUCCESS", "FAILED", "RUNNING"])("deduplicates %s across client request IDs without overwriting it", async status => {
  const prior = { id: "prior", keywordId: "k", status, createdAt: new Date() };
  mock.aioMeasurement.findMany.mockResolvedValue([prior]);
  const provider = vi.fn();
  expect(await run(provider)).toEqual(prior);
  expect(provider).not.toHaveBeenCalled(); expect(mock.aioMeasurement.create).not.toHaveBeenCalled();
});
it("does not pause between different completed keywords in a batch", async () => {
  mock.aioMeasurement.findMany.mockResolvedValue([{ id: "other", keywordId: "other", status: "SUCCESS", createdAt: new Date() }]);
  expect(await run()).toMatchObject({ status: "SUCCESS" });
});
it("builds a natural query with saved location, retaining keyword intent and hiding school identity", () => {
  const input = { keyword: "自習室 塾", municipality: "", nearestStation: "", school: { name: "秘密校舎", prefecture: "熊本県", city: "熊本市", addressLine: "固有住所" } };
  expect(buildAioQuery(input)).toContain("熊本県・熊本市周辺");
  expect(buildAioQuery(input)).toContain("「自習室 塾」");
  expect(buildAioQuery(input)).not.toMatch(/秘密校舎|固有住所|高校生/);
  expect(buildAioQuery({ ...input, school: {} })).not.toContain("熊本");
});
it("loads at most 50 attempts while preserving old citation arrays and signaling truncation", async () => {
  const citations = [{ url: "https://example.org", title: "旧実測" }];
  mock.targetKeyword.findMany.mockResolvedValue([{ id: "k", aioMeasurements: Array.from({ length: 51 }, (_, i) => ({ id: String(i), citations })) }]);
  const result = await loadAioMeasurements(db, "s");
  expect(result.keywords[0].history).toHaveLength(50);
  expect(result.keywords[0]).toMatchObject({ historyTruncated: true, latest: { citations, usage: null } });
});
it("loads one past real answer scoped to school without a provider call or mutation", async () => {
  mock.aioMeasurement.findFirst.mockResolvedValue({ id: "old", citations: [], response: "保存回答" });
  expect(await loadAioMeasurementDetail(db, "s", "old")).toMatchObject({ response: "保存回答" });
  expect(mock.aioMeasurement.findFirst).toHaveBeenCalledWith({ where: { id: "old", schoolId: "s", provider: "openai-web-search", source: "openai-search-v1" } });
  expect(mock.aioMeasurement.update).not.toHaveBeenCalled();
  mock.aioMeasurement.findFirst.mockResolvedValue(null);
  await expect(loadAioMeasurementDetail(db, "s", "foreign")).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const id of ["", "a".repeat(201)]) await expect(loadAioMeasurementDetail(db, "s", id)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
});
it("reads execution history in the authorized school's relation without returning notes or actors", async () => {
  const document = { schemaVersion: 1, missions: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, completedAt: null, note: "private-note", actorId: "private-actor" })), nextActionHistory: [] };
  mock.targetKeyword.findMany.mockResolvedValue([{ id: "k", aioMeasurements: [], rankHistories: [], school: { name: "A塾", challenge: { document } } }]);
  const result = await loadAioMeasurements(db, "s");
  expect(result.comparisonContext.history.status).toBe("AVAILABLE");
  expect(JSON.stringify(result)).not.toMatch(/private-note|private-actor|schemaVersion/);
  expect(result.school).toEqual({ name: "A塾" });
});
