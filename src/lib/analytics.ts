type MetricInput = {
  schoolId: string;
  date: string | Date;
  views?: number | null;
  searches?: number | null;
  websiteClicks?: number | null;
  phoneCalls?: number | null;
  routeRequests?: number | null;
};

export type NormalizedGbpMetric = {
  schoolId: string;
  date: Date;
  views: number;
  searches: number;
  websiteClicks: number;
  phoneCalls: number;
  routeRequests: number;
};

type PrismaMetricClient = {
  gbpMetric: {
    upsert(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<unknown[]>;
  };
};

type PrismaMetricUpsertClient = {
  gbpMetric: {
    upsert(args: unknown): Promise<unknown>;
  };
};

type LookerStudioQuery = {
  ownerId: string;
  schoolId?: string;
  from?: string;
  to?: string;
};

function toDateOnly(value: string | Date) {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function toMetricInteger(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(Number(value)));
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function normalizeGbpMetric(input: MetricInput): NormalizedGbpMetric {
  return {
    schoolId: input.schoolId,
    date: toDateOnly(input.date),
    views: toMetricInteger(input.views),
    searches: toMetricInteger(input.searches),
    websiteClicks: toMetricInteger(input.websiteClicks),
    phoneCalls: toMetricInteger(input.phoneCalls),
    routeRequests: toMetricInteger(input.routeRequests),
  };
}

export function buildGbpMetricDateRange(now = new Date()) {
  const today = toDateOnly(now);
  const previousDay = new Date(today);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);

  return {
    startDate: formatDate(previousDay),
    endDate: formatDate(today),
    metricDate: formatDate(previousDay),
  };
}

export async function upsertGbpMetric(
  prisma: PrismaMetricUpsertClient,
  metric: NormalizedGbpMetric,
) {
  return prisma.gbpMetric.upsert({
    where: {
      schoolId_date: {
        schoolId: metric.schoolId,
        date: metric.date,
      },
    },
    update: {
      views: metric.views,
      searches: metric.searches,
      websiteClicks: metric.websiteClicks,
      phoneCalls: metric.phoneCalls,
      routeRequests: metric.routeRequests,
    },
    create: metric,
  });
}

export async function buildLookerStudioRows(
  prisma: Pick<PrismaMetricClient, "gbpMetric">,
  query: LookerStudioQuery,
) {
  const rows = await prisma.gbpMetric.findMany({
    where: {
      school: {
        ownerId: query.ownerId,
      },
      ...(query.schoolId ? { schoolId: query.schoolId } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDateOnly(query.from) } : {}),
              ...(query.to ? { lte: toDateOnly(query.to) } : {}),
            },
          }
        : {}),
    },
    include: {
      school: {
        select: {
          id: true,
          name: true,
          ownerId: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { schoolId: "asc" }],
  });

  return rows.map((row) => {
    const metric = row as {
      date: Date;
      views: number;
      searches: number;
      websiteClicks: number;
      phoneCalls: number;
      routeRequests: number;
      school: {
        id: string;
        name: string;
      };
    };

    return {
      schoolId: metric.school.id,
      schoolName: metric.school.name,
      date: formatDate(metric.date),
      views: metric.views,
      searches: metric.searches,
      websiteClicks: metric.websiteClicks,
      phoneCalls: metric.phoneCalls,
      routeRequests: metric.routeRequests,
    };
  });
}
