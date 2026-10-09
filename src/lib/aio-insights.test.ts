import { expect, it } from "vitest";
import { aggregateAio, aioHistory, extractCompetitors, aioActions } from "./aio-insights";
import type { MeasurementView } from "./aio-view";

const row = (status = "SUCCESS", recommended = false, date = "2026-10-09T06:00:00Z") => ({ id: date, status, recommended, score: recommended ? 100 : 0, brandDetected: recommended, measuredAt: date, createdAt: date, response: "回答", model: "gpt-4.1-mini", query: "塾", evidence: "", citations: [], errorCode: null } satisfies MeasurementView);
it("aggregates four latest successes, excludes errors and never invents zero", () => {
  expect(aggregateAio([row(), row("SUCCESS", true), row(), row()])).toMatchObject({ rate: 25, successful: 4, recommended: 1 });
  expect(aggregateAio([row("SUCCESS", true), row(), row(), row("FAILED")])).toMatchObject({ rate: 33, failed: 1, successful: 3 });
  expect(aggregateAio([row(), row(), row(), row()]).rate).toBe(0);
  expect(aggregateAio([null, row("FAILED"), row("CONFIG_REQUIRED")]).rate).toBeNull();
  expect(aggregateAio([row("SUCCESS", true), row("SUCCESS", true)]).allRecommended).toBe(true);
  expect(aggregateAio([row("SUCCESS", true), null]).allRecommended).toBe(false);
  expect(aggregateAio([]).allRecommended).toBe(false);
});
it("builds zero/one/many real history points and uses latest attempts, not stale success", () => {
  expect(aioHistory([])).toEqual([]);
  expect(aioHistory([{ id: "k", history: [row()] }])).toMatchObject([{ rate: 0, successful: 1 }]);
  const history = aioHistory([{ id: "k", history: [row("SUCCESS", true, "2026-10-10T00:00:00Z"), row()] }, { id: "k2", history: [row("FAILED", false, "2026-10-10T01:00:00Z")] }]);
  expect(history.map(p => p.rate)).toEqual([0, 100]);
  expect(history[1].failed).toBe(1);
  expect(aioHistory([{ id: "k", history: [row("FAILED")] }])[0].rate).toBeNull();
});
it("extracts only explicitly recommended cram-school candidates with verbatim evidence", () => {
  const response = "おすすめの予備校を紹介します。\n1. **南城館予備校**\n少人数で大学受験を支援します。\n2. **熊本大学**\n大学です。\n3. **熊本駅**\n4. **Google**\n5. **自校塾**\n学習塾です。\n6. **情報塾ランキング**\n比較サイトです。\n7. **偽予備校**\nおすすめしません。";
  expect(extractCompetitors(response, "自校塾")).toEqual([{ name: "南城館予備校", evidence: "1. **南城館予備校**\n少人数で大学受験を支援します。" }]);
  expect(extractCompetitors("A塾についての情報はありません。", "自校塾")).toEqual([]);
  expect(extractCompetitors("おすすめ：\n- **熊本市**\n- **熊本高校**\n- **学習塾検索サイト**", "自校塾")).toEqual([]);
});
it("only offers up to three existing guide actions for successful recommendation-negative themes", () => {
  const actions = aioActions(row(), [{ name: "他予備校", evidence: "他予備校は自習室と大学受験の指導をおすすめします。" }]);
  expect(actions.length).toBeLessThanOrEqual(3);
  expect(actions.map(a => a.key)).toContain("check-2-photo4");
  expect(actions.every(a => a.path.startsWith("/dashboard/"))).toBe(true);
  expect(aioActions(row("SUCCESS", true), [])).toEqual([]);
  expect(aioActions(row("FAILED"), [])).toEqual([]);
  expect(aioActions(null, [])).toEqual([]);
  expect(aioActions(row(), [], false, 10).map(a => a.key)).toEqual(["google-connect", "request-reviews", "competitor-improvement"]);
  expect(aioActions(row(), [], true, 0).map(a => a.key)).not.toContain("request-reviews");
  expect(extractCompetitors("おすすめの塾はありません。\n1. **架空塾**\n大学受験を指導。", "自校塾")).toEqual([]);
});
