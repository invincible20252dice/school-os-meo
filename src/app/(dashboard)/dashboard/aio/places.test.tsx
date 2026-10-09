// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { AioComparison } from "./comparison";
import { readActionHistory, type GoogleObservation } from "@/lib/aio-comparison";
import type { AioViewData } from "@/lib/aio-view";
const now = new Date().toISOString();
const data: AioViewData = { configured: true, canMeasure: true, pilotKeywordId: null, school: { name: "自塾", googlePlaceId: "own", prefecture: "県", city: "市", addressLine: "1", websiteUrl: null, schoolSetting: null }, comparisonContext: { asOf: now, places: [], history: readActionHistory(null) }, keywords: [{ id: "k", keyword: "塾", municipality: "市", nearestStation: "", latest: { id: "m", status: "SUCCESS", query: "塾", response: "おすすめの塾\n1. **検証予備校**\n大学受験を支援します。", recommended: false, brandDetected: false, score: 0, measuredAt: now, createdAt: now, model: "model", errorCode: null, evidence: null, citations: [] } }] };
const place = (placeId: string, name: string, reviewCount: number): GoogleObservation => ({ placeId, name, address: "県市1", source: "google-places", transient: true, checkedAt: now, retentionUntil: new Date(Date.now() + 300000).toISOString(), reviewCount, rating: 4.5, photoCount: null, photoAvailable: true, replyRate: null, reviewAge: null, postAge: null, category: "school", services: null, website: true, googleMapsUri: "https://maps.google.com/", attributions: [{ provider: "情報提供元", uri: "https://example.org" }] });
const result = () => ({ places: [place("own", "自塾", 3), place("other", "検証予備校", 31)], asOf: now, requests: 3, failures: [] });
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); });
it("only fetches on explicit action, prevents concurrent calls and discards all values on reload", async () => {
  let resolve!: (value: ReturnType<typeof result>) => void;
  const refresh = vi.fn().mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<AioComparison data={data} schoolId="a" requestPlaces={refresh} />);
  expect(refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("最新情報を取得")); fireEvent.click(screen.getByText("取得中"));
  expect(refresh).toHaveBeenCalledTimes(1);
  await act(async () => resolve(result()));
  expect(screen.getByText("31件")).toBeDefined();
  expect(screen.getByText("Google Maps").getAttribute("translate")).toBe("no");
  expect(screen.getByTestId("aio-school-actions").textContent).toContain("Google現在値");
  expect(sessionStorage.length).toBe(0);
  view.unmount(); render(<AioComparison data={data} schoolId="a" requestPlaces={refresh} />);
  expect(screen.queryByText("31件")).toBeNull(); expect(refresh).toHaveBeenCalledTimes(1);
});
it("clears previous values on failure and keeps request identity for uncertain transport errors", async () => {
  const refresh = vi.fn().mockResolvedValueOnce(result()).mockRejectedValue(new Error("private response"));
  render(<AioComparison data={data} schoolId="a" requestPlaces={refresh} />);
  fireEvent.click(screen.getByText("最新情報を取得")); await screen.findByText("31件");
  fireEvent.click(screen.getByText("最新情報を取得")); await screen.findByText(/競合Googleデータを取得できませんでした/);
  expect(screen.queryByText("31件")).toBeNull(); expect(screen.queryByText(/private response/)).toBeNull();
  const id = sessionStorage.getItem("aio-places-request:a"); expect(id).toMatch(/^[a-f0-9-]{36}$/);
  fireEvent.click(screen.getByText("最新情報を取得")); await act(async () => {});
  expect(refresh.mock.calls[2][0]).toBe(id);
});
it("distinguishes safe configuration error and partial result and expires volatile content", async () => {
  const refresh = vi.fn().mockRejectedValueOnce(Object.assign(new Error("private"), { code: "NOT_CONFIGURED" })).mockResolvedValue({ ...result(), failures: [{ candidate: "別校舎", code: "AMBIGUOUS" }] });
  render(<AioComparison data={data} schoolId="a" requestPlaces={refresh} />);
  fireEvent.click(screen.getByText("最新情報を取得")); await screen.findByText(/設定が必要（Places APIキー）/);
  expect(sessionStorage.length).toBe(0);
  fireEvent.click(screen.getByText("最新情報を取得")); await screen.findByText("31件");
  expect(screen.getByText(/店舗の名称・地域・校舎を確定/)).toBeDefined();
  cleanup(); vi.useFakeTimers();
  render(<AioComparison data={data} schoolId="a" requestPlaces={vi.fn().mockResolvedValue(result())} />);
  await act(async () => fireEvent.click(screen.getByText("最新情報を取得")));
  await act(async () => vi.advanceTimersByTime(300000));
  expect(screen.queryByText("31件")).toBeNull(); expect(screen.getByText(/表示期限を過ぎました/)).toBeDefined();
});
