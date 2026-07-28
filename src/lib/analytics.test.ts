import { describe, expect, it, vi } from "vitest";
import {
  buildGbpMetricDateRange,
  buildLookerStudioRows,
  normalizeGbpMetric,
  upsertGbpMetric,
} from "./analytics";

describe("analytics", () => {
  it("normalizes GBP metric payloads into non-negative integer values", () => {
    const metric = normalizeGbpMetric({
      schoolId: "school_1",
      date: "2026-07-21",
      views: 120.8,
      searches: -4,
      websiteClicks: 9,
      phoneCalls: undefined,
      routeRequests: 2,
    });

    expect(metric).toEqual({
      schoolId: "school_1",
      date: new Date("2026-07-21T00:00:00.000Z"),
      views: 120,
      searches: 0,
      websiteClicks: 9,
      phoneCalls: 0,
      routeRequests: 2,
    });
  });

  it("normalizes Date inputs and null metric values", () => {
    const metric = normalizeGbpMetric({
      schoolId: "school_1",
      date: new Date("2026-07-21T23:59:59.000Z"),
      views: null,
      searches: Number.NaN,
      websiteClicks: 2.9,
      phoneCalls: -1,
      routeRequests: undefined,
    });

    expect(metric).toEqual({
      schoolId: "school_1",
      date: new Date("2026-07-21T00:00:00.000Z"),
      views: 0,
      searches: 0,
      websiteClicks: 2,
      phoneCalls: 0,
      routeRequests: 0,
    });
  });

  it("builds a previous-day date range for cron collection", () => {
    const range = buildGbpMetricDateRange(new Date("2026-07-22T09:30:00.000Z"));

    expect(range).toEqual({
      startDate: "2026-07-21",
      endDate: "2026-07-22",
      metricDate: "2026-07-21",
    });
  });

  it("upserts metrics by school and date", async () => {
    const prisma = {
      gbpMetric: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_1", ...create })),
      },
    };
    const metric = normalizeGbpMetric({
      schoolId: "school_1",
      date: "2026-07-21",
      views: 10,
      searches: 5,
      websiteClicks: 2,
      phoneCalls: 1,
      routeRequests: 3,
    });

    await upsertGbpMetric(prisma, metric);

    expect(prisma.gbpMetric.upsert).toHaveBeenCalledWith({
      where: {
        schoolId_date: {
          schoolId: "school_1",
          date: new Date("2026-07-21T00:00:00.000Z"),
        },
      },
      update: {
        views: 10,
        searches: 5,
        websiteClicks: 2,
        phoneCalls: 1,
        routeRequests: 3,
      },
      create: metric,
    });
  });

  it("builds Looker Studio rows scoped by owner", async () => {
    const prisma = {
      gbpMetric: {
        findMany: vi.fn(async () => [
          {
            date: new Date("2026-07-21T00:00:00.000Z"),
            views: 120,
            searches: 34,
            websiteClicks: 8,
            phoneCalls: 4,
            routeRequests: 5,
            school: {
              id: "school_1",
              name: "青葉ゼミナール",
              ownerId: "user_1",
            },
          },
        ]),
      },
    };

    const rows = await buildLookerStudioRows(prisma, {
      ownerId: "user_1",
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(prisma.gbpMetric.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          school: { ownerId: "user_1" },
        }),
      }),
    );
    expect(rows).toEqual([
      {
        schoolId: "school_1",
        schoolName: "青葉ゼミナール",
        date: "2026-07-21",
        views: 120,
        searches: 34,
        websiteClicks: 8,
        phoneCalls: 4,
        routeRequests: 5,
      },
    ]);
  });

  it("builds Looker Studio filters for school and open-ended date ranges", async () => {
    const prisma = {
      gbpMetric: {
        findMany: vi.fn(async () => []),
      },
    };

    await buildLookerStudioRows(prisma, {
      ownerId: "user_1",
      schoolId: "school_1",
      from: "2026-07-01",
    });
    await buildLookerStudioRows(prisma, {
      ownerId: "user_1",
      schoolId: "school_1",
      to: "2026-07-31",
    });
    await buildLookerStudioRows(prisma, {
      ownerId: "user_1",
      schoolId: "school_1",
    });

    expect(prisma.gbpMetric.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: "school_1",
          date: { gte: new Date("2026-07-01T00:00:00.000Z") },
        }),
      }),
    );
    expect(prisma.gbpMetric.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          schoolId: "school_1",
          date: { lte: new Date("2026-07-31T00:00:00.000Z") },
        }),
      }),
    );
    expect(prisma.gbpMetric.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.not.objectContaining({
          date: expect.anything(),
        }),
      }),
    );
  });
});
