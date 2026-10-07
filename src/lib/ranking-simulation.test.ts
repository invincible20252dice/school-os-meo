import { describe, expect, it } from "vitest";
import { buildDashboardRankingData } from "./dashboard-rankings";
import { withRankingSimulation } from "./ranking-simulation";

const base = () => buildDashboardRankingData({ school: { id: "cms5tnzlr0001jt04qh0lluva", name: "校舎" }, keywords: [] });
describe("scoped ranking simulation", () => {
  it.each([undefined, "simulation-1", "simulation-2", "simulation-3"])("returns labeled fixtures and consistent ranking for %s", id => {
    const data = withRankingSimulation(base(), id);
    expect(data.dataSource).toBe("SIMULATION");
    expect(data.history).toHaveLength(7);
    expect(data.competitors).toHaveLength(10);
    expect(data.competitors.find(row => row.isOwnSchool)?.rank).toBe(data.currentRank);
    expect(data.history[6].rank).toBe(data.currentRank);
    expect(data.selectedKeyword).toMatchObject({ municipality: "熊本市中央区手取本町", nearestStation: "通町筋駅", latitude: 32.8032 });
  });
  it("never substitutes other schools, missing schools, or unknown keywords", () => {
    for (const input of [{ ...base(), school: null }, { ...base(), school: { ...base().school!, id: "other" } }]) {
      expect(withRankingSimulation(input)).toEqual({ ...input, dataSource: "DATABASE" });
    }
    expect(withRankingSimulation(base(), "unknown").selectedKeyword).toBeNull();
  });
  it("preserves real measurements including out-of-range and does not mutate input", () => {
    expect(withRankingSimulation({ ...base(), hasRegisteredKeywords: true }).dataSource).toBe("DATABASE");
    const real = { ...base(), measuredAt: "2026-10-08T00:00:00Z", currentRank: null };
    expect(withRankingSimulation(real)).toEqual({ ...real, dataSource: "DATABASE" });
    const input = base();
    withRankingSimulation(input);
    expect(input.keywords).toEqual([]);
    expect(input.measuredAt).toBeNull();
  });
  it("retains database keyword IDs for transparent transition to measurements", () => {
    const input = base();
    input.keywords = [{ id: "db-key", keyword: "その他", location: "", municipality: "", nearestStation: "", radiusMeters: 1000, isActive: true }];
    expect(withRankingSimulation(input, "db-key").selectedKeyword?.id).toBe("db-key");
    expect(withRankingSimulation(input).currentKeyword).toBe("その他");
  });
});
