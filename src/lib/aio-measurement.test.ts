import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadAioMeasurements, runAioMeasurement } from "./aio-measurement";
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
it("does not expand to another keyword before the live pilot passes", async () => {
  mock.aioMeasurement.findFirst.mockResolvedValue({ keywordId: "first" });
  await expect(run()).rejects.toMatchObject({ code: "PILOT_LIMIT" });
});
it.each([{ status: "FAILED", age: 1000 }, { status: "RUNNING", age: 120000 }])("limits concurrent and rapid requests", async row => {
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
  expect(await loadAioMeasurements(db, "s")).toMatchObject({ configured: true, pilotKeywordId: "k", keywords: [{ latest: { status: "FAILED" } }, { latest: null }] });
  expect(mock.targetKeyword.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "s", isActive: true } }));
  vi.stubEnv("OPENAI_API_KEY", ""); mock.aioMeasurement.findFirst.mockResolvedValue(null);
  expect(await loadAioMeasurements(db, "s")).toMatchObject({ configured: false, pilotKeywordId: null });
});
