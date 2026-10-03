import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { refreshGoogleAccessToken } from "./google-gbp-oauth";
import { jstDay, leadObject, leadPeriod } from "./google-leads";

const metricNames = ["WEBSITE_CLICKS", "CALL_CLICKS"] as const;
type Point = { date: string; websiteClicks: number; phoneCalls: number };
export function parsePerformance(value: unknown, from: string, to: string): Point[] {
  const body = leadObject(value);
  if (!Array.isArray(body.multiDailyMetricTimeSeries)) throw new Error("Missing time series");
  const maps = metricNames.map(() => new Map<string, number>());
  for (const group of body.multiDailyMetricTimeSeries) {
    const series = leadObject(group).dailyMetricTimeSeries;
    if (!Array.isArray(series)) throw new Error("Invalid series");
    for (const raw of series) {
      const row = leadObject(raw);
      const index = metricNames.findIndex(name => name === row.dailyMetric);
      if (index < 0) continue;
      const values = leadObject(row.timeSeries).datedValues;
      if (!Array.isArray(values)) throw new Error("Missing daily values");
      for (const rawPoint of values) {
        const point = leadObject(rawPoint), date = leadObject(point.date);
        const key = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
        const parsed = new Date(`${key}T00:00:00Z`);
        if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== key) throw new Error("Invalid date");
        // Google omits value when the daily count is zero; missing dates are not zero.
        if (point.value !== undefined && !(typeof point.value === "number" || (typeof point.value === "string" && /^\d+$/.test(point.value)))) throw new Error("Invalid metric");
        const count = point.value === undefined ? 0 : Number(point.value);
        if (!Number.isSafeInteger(count) || count < 0 || count > 2147483647 || point.value === null) throw new Error("Invalid metric");
        if (key < from || key > to) continue;
        if (maps[index].has(key)) throw new Error("Duplicate daily metric");
        maps[index].set(key, count);
      }
    }
  }
  return [...maps[0]].filter(([day]) => maps[1].has(day)).sort(([a], [b]) => a.localeCompare(b)).map(([date, websiteClicks]) => ({ date, websiteClicks, phoneCalls: maps[1].get(date)! }));
}
export async function fetchPerformance(locationId: string, refreshToken: string, from: string, to: string, fetchImpl: typeof fetch = fetch) {
  const match = /^(?:locations\/)?(\d+)$/.exec(locationId);
  if (!match) throw new Error("Invalid location");
  const timed: typeof fetch = (url, init) => fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const token = await refreshGoogleAccessToken({ refreshToken, fetchImpl: timed });
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${match[1]}:fetchMultiDailyMetricsTimeSeries`);
  metricNames.forEach(name => url.searchParams.append("dailyMetrics", name));
  for (const [side, day] of [["startDate", from], ["endDate", to]]) {
    day.split("-").forEach((part, i) => url.searchParams.set(`dailyRange.${side}.${["year", "month", "day"][i]}`, String(Number(part))));
  }
  const response = await timed(url.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Performance HTTP ${response.status}`);
  return parsePerformance(await response.json(), from, to);
}
export async function loadPerformance(schoolId: string, periodName: string, now = new Date()) {
  const period = leadPeriod(periodName, now);
  const from = jstDay(period.from);
  // Exclude the current unfinished JST day; Google's reporting can have additional latency.
  const to = jstDay(new Date(period.to.getTime() - (periodName === "previous" ? 1 : 86400_000)));
  const empty = { websiteClicks: null, phoneClicks: null, updatedAt: null, from, to, measuredDays: 0 };
  try {
    const setting = await prisma.schoolSetting.findUnique({ where: { schoolId }, select: { googleRefreshToken: true, selectedGbpLocationId: true } });
    const account = await prisma.googleAccount.findUnique({ where: { schoolId }, select: { refreshToken: true, locationId: true } });
    const token = setting?.googleRefreshToken || account?.refreshToken;
    const location = setting?.selectedGbpLocationId || account?.locationId;
    if (!token || !location) return { ...empty, state: "disconnected" as const };
    if (to < from) return { ...empty, state: "unavailable" as const };
    // Persist only verified paired daily click counts in the existing metric table.
    // The hourly Next data cache also caches API failures, avoiding retry storms.
    const sync = unstable_cache(async () => {
      try {
        const points = await fetchPerformance(location, token, from, to);
        for (const point of points) {
          const values = { websiteClicks: point.websiteClicks, phoneCalls: point.phoneCalls, performanceFetchedAt: new Date(), performanceLocationId: location };
          const date = new Date(`${point.date}T00:00:00Z`);
          await prisma.gbpMetric.upsert({ where: { schoolId_date: { schoolId, date } }, update: values, create: { schoolId, date, ...values } });
        }
        return true;
      } catch { console.error("[Google performance] Fetch/store failed"); return false; }
    }, ["google-performance-v1", schoolId, location, from, to], { revalidate: 3600 });
    const succeeded = await sync();
    const rows = await prisma.gbpMetric.findMany({ where: { schoolId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, performanceLocationId: location, performanceFetchedAt: { not: null } },
      select: { websiteClicks: true, phoneCalls: true, date: true, performanceFetchedAt: true }, orderBy: { date: "asc" } });
    if (!rows.length) return { ...empty, state: succeeded ? "unavailable" as const : "error" as const };
    return { state: succeeded ? "available" as const : "stale" as const, websiteClicks: rows.reduce((sum, row) => sum + row.websiteClicks, 0), phoneClicks: rows.reduce((sum, row) => sum + row.phoneCalls, 0),
      updatedAt: new Date(Math.max(...rows.map(row => row.performanceFetchedAt!.getTime()))).toISOString(), from: rows[0].date.toISOString().slice(0, 10), to: rows[rows.length - 1].date.toISOString().slice(0, 10), measuredDays: rows.length };
  } catch { console.error("[Google performance] Settings/storage unavailable"); return { ...empty, state: "error" as const }; }
}
