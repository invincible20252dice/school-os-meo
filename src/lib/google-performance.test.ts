import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { unstable_cache } from "next/cache";
import { fetchPerformance, loadPerformance, parsePerformance } from "./google-performance";
import { prisma } from "./prisma";
import { refreshGoogleAccessToken } from "./google-gbp-oauth";
vi.mock("next/cache", () => ({ unstable_cache: vi.fn((fn) => fn) }));
vi.mock("./prisma", () => ({ prisma: { schoolSetting: { findUnique: vi.fn() }, googleAccount: { findUnique: vi.fn() }, gbpMetric: { upsert: vi.fn(), findMany: vi.fn() } } }));
vi.mock("./google-gbp-oauth", () => ({ refreshGoogleAccessToken: vi.fn() }));
const now = new Date("2026-10-03T12:00:00Z");
const point = (value: unknown = "4", day = 1) => ({ date: { year: 2026, month: 10, day }, value });
const payload = (web: unknown[] = [point()], phone: unknown[] = [point("0")]) => ({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: "WEBSITE_CLICKS", timeSeries: { datedValues: web } }, { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: phone } }] }] });
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify(payload())));
  vi.mocked(refreshGoogleAccessToken).mockResolvedValue("access");
  vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({ googleRefreshToken: "refresh", selectedGbpLocationId: "locations/123" } as never);
  vi.mocked(prisma.googleAccount.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.gbpMetric.upsert).mockResolvedValue({} as never);
  vi.mocked(prisma.gbpMetric.findMany).mockResolvedValue([]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("parses actual counts, omitted zeros, sorted paired days and ignores unrequested metrics/dates", () => {
  const raw = payload([point(7, 2), { date: point().date }, point("8"), point("6", 3)], [point("0"), point("1", 2)]);
  raw.multiDailyMetricTimeSeries[0].dailyMetricTimeSeries.push({ dailyMetric: "OTHER", timeSeries: { datedValues: [] } });
  // Remove duplicate day 1 to test the omitted zero independently.
  raw.multiDailyMetricTimeSeries[0].dailyMetricTimeSeries[0].timeSeries.datedValues.splice(2, 1);
  expect(parsePerformance(raw, "2026-10-01", "2026-10-02")).toEqual([{ date: "2026-10-01", websiteClicks: 0, phoneCalls: 0 }, { date: "2026-10-02", websiteClicks: 7, phoneCalls: 1 }]);
  expect(parsePerformance(payload([point("4", 2)], [point("1")]), "2026-10-01", "2026-10-02")).toEqual([]);
  expect(parsePerformance(payload(), "2026-10-02", "2026-10-02")).toEqual([]);
});
it("does not turn invalid payloads/counts into zeros", () => {
  for (const raw of [{}, { multiDailyMetricTimeSeries: [{}] }, { multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: "WEBSITE_CLICKS", timeSeries: {} }] }] }, payload([{ date: { year: 2026, month: 2, day: 30 } }]), payload([point(), point()])]) {
    expect(() => parsePerformance(raw, "2026-01-01", "2026-12-31")).toThrow();
  }
  for (const value of [null, "", false, "bad", -1, 1.2, Infinity, 2147483648]) expect(() => parsePerformance(payload([point(value)]), "2026-10-01", "2026-10-02")).toThrow();
});
it.each(["locations/123", "123"])("uses existing OAuth and official daily metrics request for %s", async location => {
  const result = await fetchPerformance(location, "refresh", "2026-10-01", "2026-10-02", fetchMock);
  expect(result[0].websiteClicks).toBe(4);
  const [url, init] = fetchMock.mock.calls[0];
  const parsed = new URL(url);
  expect(parsed.origin + parsed.pathname).toBe("https://businessprofileperformance.googleapis.com/v1/locations/123:fetchMultiDailyMetricsTimeSeries");
  expect(parsed.searchParams.getAll("dailyMetrics")).toEqual(["WEBSITE_CLICKS", "CALL_CLICKS"]);
  expect(parsed.searchParams.get("dailyRange.startDate.year")).toBe("2026");
  expect(parsed.searchParams.get("dailyRange.endDate.day")).toBe("2");
  expect(init.headers).toEqual({ Authorization: "Bearer access" });
  const timed = vi.mocked(refreshGoogleAccessToken).mock.calls[0][0].fetchImpl!;
  fetchMock.mockResolvedValue(new Response("{}"));
  await timed("https://oauth2.googleapis.com/token", { method: "POST" });
  expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
});
it("rejects invalid resource IDs and non-2xx replies", async () => {
  await expect(fetchPerformance("../bad", "refresh", "2026-10-01", "2026-10-02")).rejects.toThrow("location");
  fetchMock.mockResolvedValue(new Response("denied", { status: 403 }));
  await expect(fetchPerformance("123", "refresh", "2026-10-01", "2026-10-02")).rejects.toThrow("403");
});
it("stores and aggregates only verified paired days for the selected school/location", async () => {
  vi.mocked(prisma.gbpMetric.findMany).mockResolvedValue([{ date: new Date("2026-10-01"), websiteClicks: 4, phoneCalls: 0, performanceFetchedAt: now }, { date: new Date("2026-10-02"), websiteClicks: 2, phoneCalls: 1, performanceFetchedAt: now }] as never);
  expect(await loadPerformance("a", "month", now)).toEqual({ state: "available", websiteClicks: 6, phoneClicks: 1, updatedAt: now.toISOString(), from: "2026-10-01", to: "2026-10-02", measuredDays: 2 });
  expect(prisma.gbpMetric.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId_date: { schoolId: "a", date: new Date("2026-10-01") } }, update: { websiteClicks: 4, phoneCalls: 0, performanceFetchedAt: expect.any(Date), performanceLocationId: "locations/123" } }));
  expect(prisma.gbpMetric.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { schoolId: "a", date: { gte: new Date("2026-10-01"), lte: new Date("2026-10-02") }, performanceLocationId: "locations/123", performanceFetchedAt: { not: null } } }));
  expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["google-performance-v1", "a", "locations/123", "2026-10-01", "2026-10-02"], { revalidate: 3600 });
});
it("reuses same-school legacy account storage and supports previous month/default time", async () => {
  vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.googleAccount.findUnique).mockResolvedValue({ refreshToken: "legacy", locationId: "123" } as never);
  expect((await loadPerformance("a", "previous", now)).state).toBe("unavailable");
  expect(prisma.googleAccount.findUnique).toHaveBeenCalledWith({ where: { schoolId: "a" }, select: { refreshToken: true, locationId: true } });
  expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["google-performance-v1", "a", "123", "2026-09-01", "2026-09-30"], { revalidate: 3600 });
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ multiDailyMetricTimeSeries: [] })));
  await loadPerformance("a", "month");
});
it("distinguishes disconnected, no finished days, no data and errors without blocking manual leads", async () => {
  expect((await loadPerformance("a", "month", new Date("2026-10-01T00:00:00+09:00"))).state).toBe("unavailable");
  expect(fetchMock).not.toHaveBeenCalled();
  vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue(null);
  expect((await loadPerformance("a", "month", now)).state).toBe("disconnected");
  vi.mocked(prisma.schoolSetting.findUnique).mockResolvedValue({ googleRefreshToken: "x", selectedGbpLocationId: null } as never);
  expect((await loadPerformance("a", "month", now)).state).toBe("disconnected");
  vi.mocked(prisma.schoolSetting.findUnique).mockRejectedValue(new Error("db"));
  expect((await loadPerformance("a", "month", now)).state).toBe("error");
});
it("retains explicit stale state when quota fails and never fabricates 0", async () => {
  fetchMock.mockResolvedValue(new Response("quota", { status: 429 }));
  expect(await loadPerformance("a", "month", now)).toMatchObject({ state: "error", websiteClicks: null, phoneClicks: null });
  vi.mocked(prisma.gbpMetric.findMany).mockResolvedValue([{ date: new Date("2026-10-01"), websiteClicks: 0, phoneCalls: 0, performanceFetchedAt: now }] as never);
  expect(await loadPerformance("a", "month", now)).toMatchObject({ state: "stale", websiteClicks: 0, phoneClicks: 0 });
  expect(prisma.gbpMetric.upsert).not.toHaveBeenCalled();
});
