import {
  buildGbpMetricDateRange,
  normalizeGbpMetric,
  upsertGbpMetric,
  type NormalizedGbpMetric,
} from "./analytics";

type FetchLike = typeof fetch;

type SchoolForMetrics = {
  id: string;
  gbpLocationId?: string | null;
};

type PrismaMetricsClient = {
  school: {
    findMany(args: unknown): Promise<SchoolForMetrics[]>;
  };
  gbpMetric: {
    upsert(args: unknown): Promise<unknown>;
  };
};

type MetricRange = ReturnType<typeof buildGbpMetricDateRange>;

function buildMetricsUrl(
  baseUrl: string,
  school: SchoolForMetrics,
  range: MetricRange,
) {
  const url = new URL(baseUrl);
  url.searchParams.set("locationId", school.gbpLocationId || "");
  url.searchParams.set("startDate", range.startDate);
  url.searchParams.set("endDate", range.endDate);

  return url.toString();
}

export async function fetchGbpMetricForSchool(
  school: SchoolForMetrics,
  range: MetricRange,
  fetchImpl: FetchLike = fetch,
): Promise<NormalizedGbpMetric> {
  const baseUrl = process.env.GBP_METRICS_API_URL;

  if (!baseUrl) {
    throw new Error("GBP_METRICS_API_URL is not configured.");
  }

  if (!school.gbpLocationId) {
    throw new Error("School does not have gbpLocationId.");
  }

  const response = await fetchImpl(buildMetricsUrl(baseUrl, school, range), {
    headers: process.env.GBP_API_ACCESS_TOKEN
      ? { Authorization: `Bearer ${process.env.GBP_API_ACCESS_TOKEN}` }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`GBP metrics fetch failed: ${response.status}`);
  }

  const data = await response.json();

  return normalizeGbpMetric({
    schoolId: school.id,
    date: range.metricDate,
    views: data.views,
    searches: data.searches,
    websiteClicks: data.websiteClicks,
    phoneCalls: data.phoneCalls,
    routeRequests: data.routeRequests,
  });
}

export async function fetchAndStoreGbpMetrics({
  prisma,
  fetchImpl = fetch,
  now = new Date(),
}: {
  prisma: PrismaMetricsClient;
  fetchImpl?: FetchLike;
  now?: Date;
}) {
  const schools = await prisma.school.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      gbpLocationId: true,
    },
  });
  const range = buildGbpMetricDateRange(now);
  const summary = {
    schools: schools.length,
    fetched: 0,
    stored: 0,
    skipped: 0,
  };

  for (const school of schools) {
    if (!school.gbpLocationId) {
      summary.skipped += 1;
      continue;
    }

    const metric = await fetchGbpMetricForSchool(school, range, fetchImpl);
    summary.fetched += 1;
    await upsertGbpMetric(prisma, metric);
    summary.stored += 1;
  }

  return summary;
}
