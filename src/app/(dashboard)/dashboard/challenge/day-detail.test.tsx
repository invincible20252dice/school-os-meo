// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DayCards, DayDetail, DiagnosticDetails, OutcomeMetrics, OverallProgress, ProgressMeter, RecommendedActions } from "./day-detail";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
import { missions, updateChallenge } from "@/lib/challenge";
import { dayProgress } from "@/lib/challenge-progress";
afterEach(cleanup);
const schoolId = "school & A";
describe("DAY achievement presentation", () => {
  it("simplifies cards without turning partial, waiting or deferred records into completed days", () => {
    const doc = challengeDocument();
    doc.missions[0].status = "COMPLETED";
    doc.missions[0].evidence = completeCommand(1).evidence;
    doc.missions[2].status = "WAITING";
    doc.missions[3].status = "DEFERRED";
    doc.missions[4].status = "IN_PROGRESS";
    const view = render(<DayCards compact doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText("✓ 完了")).toBeDefined();
    expect(screen.getByText("今日")).toBeDefined();
    expect(screen.getByText("確認待ち")).toBeDefined();
    expect(screen.getByText("あとで対応あり")).toBeDefined();
    expect(screen.getByText("対応中")).toBeDefined();
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    view.rerender(<DayCards compact doc={null} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getAllByRole("link").every(a => a.getAttribute("href") === "#challenge-start")).toBe(true);
  });
  it("shows seven missions before starting without claiming measured zero", () => {
    render(<DayCards doc={null} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
    expect(screen.getAllByRole("link", { name: "始める →" }).every(a => a.getAttribute("href") === "#challenge-start")).toBe(true);
  });
  it("renders distinct recorded statuses, remaining requests and CLEAR with pending checks", () => {
    const doc = challengeDocument();
    doc.missions[0].status = "COMPLETED";
    doc.missions[0].evidence.hours = "後で対応";
    doc.missions[1].status = "WAITING";
    doc.missions[2].status = "IN_PROGRESS"; doc.missions[2].evidence.requested = 7;
    doc.missions[3].status = "DEFERRED";
    render(<DayCards doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText("70%")).toBeDefined(); expect(screen.getByText("あと3名")).toBeDefined();
    expect(screen.getByText("確認待ち")).toBeDefined(); expect(screen.getByText("進行中")).toBeDefined();
    expect(screen.getByText("あとで対応")).toBeDefined(); expect(screen.getByText("CLEAR")).toBeDefined();
    expect(screen.getByText("あとで対応あり：7項目")).toBeDefined();
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("href")).toContain("schoolId=school%20%26%20A");
  });
  it("does not hide outstanding review handling when the request target is reached", () => {
    const doc = challengeDocument(); doc.missions[3].evidence = { requested: 10 };
    const view = render(<DayCards doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText("口コミ対応：確認が必要")).toBeDefined();
    doc.missions[3].evidence.reviews = "対応済み";
    view.rerender(<DayCards doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText("口コミ対応：記録済み")).toBeDefined();
  });
  it.each([1, 2, 3, 4, 5, 6, 7])("renders a shared DAY%s detail with scoped CTA, evidence and outcomes", day => {
    const doc = challengeDocument();
    render(<DayDetail day={day} doc={doc} snapshot={snapshot()} schoolId={schoolId}><p>保存フォーム</p></DayDetail>);
    expect(screen.getByRole("progressbar", { name: `DAY${day} ミッション達成率` }).getAttribute("value")).toBe("0");
    const actions = screen.getByRole("region", { name: "今日やること" });
    expect(within(actions).getAllByRole("listitem").length).toBeLessThanOrEqual(3);
    expect(screen.getByText("保存フォーム")).toBeDefined();
    expect(screen.getByText("確認項目の詳細を見る").closest("details")?.open).toBe(false);
    expect(screen.getByRole("region", { name: "現在の成果" })).toBeDefined();
    expect(screen.getByRole("link", { name: day < 7 ? `それでもDAY${day + 1}へ進む →` : "今週のアクションへ →" }).getAttribute("href")).toContain("schoolId=school%20%26%20A");
    expect(screen.getByText(new RegExp(`DAY${day}はまだCLEARしていません`))).toBeDefined();
  });
  it("keeps incomplete warnings above collapsed achievements after CLEAR", () => {
    const cmd = completeCommand(1); cmd.evidence.hours = "後で対応";
    const doc = updateChallenge(challengeDocument(), cmd, snapshot(), "actor");
    render(<DayDetail day={1} doc={doc} snapshot={snapshot()} schoolId={schoolId}>{null}</DayDetail>);
    expect(screen.getByText("DAY1 CLEAR")).toBeDefined();
    expect(screen.getByRole("link", { name: "DAY2へ進む →" })).toBeDefined();
    expect(screen.getByText("達成済み 6項目").closest("details")?.open).toBe(false);
    expect(screen.getAllByText("あとで対応").length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar").getAttribute("value")).not.toBe("100");
  });
  it("distinguishes ready-to-save from a recorded CLEAR", () => {
    const doc = challengeDocument(); doc.missions[6].evidence = completeCommand(7).evidence;
    const view = render(<DayDetail day={7} doc={doc} snapshot={snapshot()} schoolId={schoolId}>{null}</DayDetail>);
    expect(screen.getByText("100%")).toBeDefined(); expect(screen.queryByText("DAY7 CLEAR")).toBeNull();
    expect(screen.getByText("未達項目はありません。")).toBeDefined();
    expect(screen.getByText(/実行記録を保存してDAYの完了/)).toBeDefined();
    doc.missions[6].status = "COMPLETED";
    view.rerender(<DayDetail day={7} doc={doc} snapshot={snapshot()} schoolId={schoolId}>{null}</DayDetail>);
    expect(screen.getByText("このDAYの実行記録は完了しています。次のミッションへ進めます。")).toBeDefined();
    expect(screen.queryByText(/実行記録を保存してDAYの完了/)).toBeNull();
  });
  it("shows an overall percentage without summing people and check counts", () => {
    const doc = challengeDocument(); doc.missions[2].evidence.requested = 7;
    const view = render(<OverallProgress doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText("10%")).toBeDefined(); expect(screen.getByText("0 / 7 DAY CLEAR")).toBeDefined();
    for (let day = 1; day <= 7; day++) doc.missions[day - 1].evidence = completeCommand(day).evidence;
    view.rerender(<OverallProgress doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText(/実行記録を保存して完了を確認/)).toBeDefined();
    doc.missions.forEach(m => { m.status = "COMPLETED"; });
    view.rerender(<OverallProgress doc={doc} snapshot={snapshot()} schoolId={schoolId} />);
    expect(screen.getByText("7 / 7 DAY CLEAR")).toBeDefined(); expect(screen.queryByText("今日のおすすめ")).toBeNull();
  });
  it("does not invent measurements or claim zero when the data fetch failed", () => {
    const doc = challengeDocument(); doc.baseline.reviews = null; doc.baseline.posts = null;
    const state = { ...snapshot(), reviews: null, posts: null, comparisons: null };
    const view = render(<OutcomeMetrics day={5} doc={doc} snapshot={state} />);
    expect(screen.getByText("取得失敗")).toBeDefined(); expect(screen.getByText("開始時データなし")).toBeDefined();
    view.rerender(<OutcomeMetrics day={5} doc={doc} snapshot={{ ...state, posts: { count: 1, latestAt: "2026-10-02T00:00:00Z" } }} />);
    expect(screen.getByText("2026-10-02")).toBeDefined();
    view.rerender(<OutcomeMetrics day={6} doc={doc} snapshot={state} />);
    expect(screen.getByText("取得失敗")).toBeDefined();
    view.rerender(<OutcomeMetrics day={6} doc={doc} snapshot={{ ...state, comparisons: [] }} />);
    expect(screen.getByText("保存記録なし")).toBeDefined();
    doc.inquiries = { google: 0, unknown: 1, other: 0, tests: 20, recordedAt: state.at, actorId: "actor" };
    view.rerender(<OutcomeMetrics day={7} doc={doc} snapshot={state} />);
    expect(screen.getByText("0件")).toBeDefined(); expect(screen.queryByText("20件")).toBeNull();
  });
  it("renders warning states and master details without creating a 38-item diagnostic", () => {
    const doc = challengeDocument(); doc.missions[0].evidence.website = "要改善";
    const view = render(<DayDetail day={1} doc={doc} snapshot={snapshot()} schoolId={schoolId}>{null}</DayDetail>);
    expect(screen.getByText(/要改善・要対応 1/)).toBeDefined();
    view.rerender(<DiagnosticDetails doc={doc} />);
    expect(screen.getAllByRole("row")).toHaveLength(1 + missions.reduce((sum, m) => sum + m.fields.length, 0));
    expect(screen.getByText(/自動診断スコアではありません/)).toBeDefined();
  });
  it("exposes accessible percentage text and status even without color", () => {
    const doc = challengeDocument(); const p = dayProgress(doc.missions[0], 10, snapshot());
    p.items[0].state = "ERROR"; p.recommended = [p.items[0]];
    render(<><ProgressMeter progress={p} label="確認進捗" /><RecommendedActions progress={p} schoolId={schoolId} /></>);
    expect(screen.getByRole("progressbar", { name: "確認進捗" }).getAttribute("max")).toBe("100");
    expect(screen.getByText("要対応")).toBeDefined();
  });
});
