import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAndStoreGbpMetrics, fetchGbpMetricForSchool } from "./gbp-metrics";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
});

describe("gbp-metrics", () => {
  it("fetches one school's GBP metrics from the configured endpoint", async () => {
    process.env.GBP_METRICS_API_URL = "https://gbp.example.com/metrics";
    process.env.GBP_API_ACCESS_TOKEN = "gbp-token";
    const fetchMock = vi.fn(async () =>
      Response.json({
        views: 100,
        searches: 20,
        websiteClicks: 7,
        phoneCalls: 3,
        routeRequests: 4,
      }),
    );

    const metric = await fetchGbpMetricForSchool(
      {
        id: "school_1",
        gbpLocationId: "location_1",
      },
      {
        startDate: "2026-07-21",
        endDate: "2026-07-22",
        metricDate: "2026-07-21",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gbp.example.com/metrics?locationId=location_1&startDate=2026-07-21&endDate=2026-07-22",
      expect.objectContaining({
        headers: { Authorization: "Bearer gbp-token" },
      }),
    );
    expect(metric).toEqual({
      schoolId: "school_1",
      date: new Date("2026-07-21T00:00:00.000Z"),
      views: 100,
      searches: 20,
      websiteClicks: 7,
      phoneCalls: 3,
      routeRequests: 4,
    });
  });

  it("stores metrics for active schools with GBP location ids", async () => {
    process.env.GBP_METRICS_API_URL = "https://gbp.example.com/metrics";
    const prisma = {
      school: {
        findMany: vi.fn(async () => [
          { id: "school_1", gbpLocationId: "location_1" },
          { id: "school_2", gbpLocationId: null },
        ]),
      },
      gbpMetric: {
        upsert: vi.fn(async ({ create }) => ({ id: "metric_1", ...create })),
      },
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        views: 10,
        searches: 5,
        websiteClicks: 2,
        phoneCalls: 1,
        routeRequests: 3,
      }),
    );

    const summary = await fetchAndStoreGbpMetrics({
      prisma,
      fetchImpl: fetchMock,
      now: new Date("2026-07-22T00:00:00.000Z"),
    });

    expect(summary).toEqual({ schools: 2, fetched: 1, stored: 1, skipped: 1 });
    expect(prisma.gbpMetric.upsert).toHaveBeenCalledOnce();
  });

  it("requires the GBP metrics endpoint", async () => {
    delete process.env.GBP_METRICS_API_URL;

    await expect(
      fetchGbpMetricForSchool(
        { id: "school_1", gbpLocationId: "location_1" },
        {
          startDate: "2026-07-21",
          endDate: "2026-07-22",
          metricDate: "2026-07-21",
        },
        vi.fn(),
      ),
    ).rejects.toThrow("GBP_METRICS_API_URL is not configured.");
  });

  it("requires a GBP location id before fetching metrics", async () => {
    process.env.GBP_METRICS_API_URL = "https://gbp.example.com/metrics";

    await expect(
      fetchGbpMetricForSchool(
        { id: "school_1", gbpLocationId: null },
        {
          startDate: "2026-07-21",
          endDate: "2026-07-22",
          metricDate: "2026-07-21",
        },
        vi.fn(),
      ),
    ).rejects.toThrow("School does not have gbpLocationId.");
  });

  it("throws when the GBP metrics endpoint rejects the request", async () => {
    process.env.GBP_METRICS_API_URL = "https://gbp.example.com/metrics";
    delete process.env.GBP_API_ACCESS_TOKEN;

    await expect(
      fetchGbpMetricForSchool(
        { id: "school_1", gbpLocationId: "location_1" },
        {
          startDate: "2026-07-21",
          endDate: "2026-07-22",
          metricDate: "2026-07-21",
        },
        vi.fn(async () => new Response("{}", { status: 500 })),
      ),
    ).rejects.toThrow("GBP metrics fetch failed: 500");
  });
});
