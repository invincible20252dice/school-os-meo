// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionPanel, ChallengeGoal } from "./next-actions";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
import { updateNextAction } from "@/lib/challenge-next-actions";
afterEach(cleanup);
describe("next action workflows", () => {
  it("shows only TOP1 with school-scoped CTA and starts without claiming completion", () => {
    const save = vi.fn();
    render(<ActionPanel doc={challengeDocument()} snapshot={snapshot()} schoolId="school & A" save={save} busy={false} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link").getAttribute("href")).toContain("schoolId=school%20%26%20A");
    fireEvent.click(screen.getByRole("button", { name: "この改善を開始する" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ action: "next-action", status: "IN_PROGRESS", note: "" }));
  });
  it("caps daily recommendations, disables operations during save, and labels non-AI/manual sources", () => {
    render(<ActionPanel doc={challengeDocument()} snapshot={snapshot()} schoolId="a" day={2} save={vi.fn()} busy />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByText("判定根拠：手動確認")).toHaveLength(3);
    expect(screen.getAllByRole("button").every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  });
  it("persists deferred and completed evidence after starting and keeps the reason visible", () => {
    const s = snapshot(); let doc = updateNextAction(challengeDocument(), { action: "next-action", key: "pending-replies", status: "IN_PROGRESS", note: "" }, s, "u");
    const save = vi.fn();
    const view = render(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={4} save={save} busy={false} />);
    fireEvent.change(screen.getByLabelText("実行結果・残課題"), { target: { value: "担当者の確認待ち" } });
    fireEvent.change(screen.getByLabelText("アクションの状態"), { target: { value: "WAITING" } });
    fireEvent.click(screen.getByRole("button", { name: "アクション記録を保存" }));
    expect(save).toHaveBeenCalledWith({ action: "next-action", key: "pending-replies", status: "WAITING", note: "担当者の確認待ち" });
    doc = updateNextAction(doc, { action: "next-action", key: "pending-replies", status: "COMPLETED", note: "Googleで公開確認" }, s, "u");
    view.rerender(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={4} save={save} busy={false} />);
    expect(screen.queryByLabelText("実行結果・残課題")).toBeNull();
    expect(screen.getByText(/Googleで公開確認/).textContent).toContain("完了 2026-10-01");
  });
  it("shows saved and proposed request targets separately and posts explicit adoption", () => {
    const s = snapshot(); const save = vi.fn(); let doc = challengeDocument();
    const view = render(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={3} save={save} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "提案の5名をDAY3目標に適用" }));
    expect(save).toHaveBeenCalledWith({ action: "adopt-request-target" });
    doc = updateNextAction(doc, { action: "adopt-request-target" }, s, "u");
    view.rerender(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={3} save={save} busy={false} />);
    expect(screen.queryByRole("button", { name: /DAY3目標/ })).toBeNull();
    expect(screen.getByText("保存済みの実行目標：5名")).toBeDefined();
    view.rerender(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={4} save={save} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "提案の0名をDAY4目標に適用" }));
    expect(save).toHaveBeenCalledWith({ action: "adopt-request-target", day: 4 });
    doc = updateNextAction(doc, { action: "adopt-request-target", day: 4 }, s, "u");
    view.rerender(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={4} save={save} busy={false} />);
    expect(screen.getByText("保存済みの追加目標：0名")).toBeDefined();
    expect(screen.queryByRole("button", { name: /DAY4目標/ })).toBeNull();
  });
  it("hides target adoption for started missions and unknown measurements", () => {
    const doc = challengeDocument(); doc.missions[2].status = "IN_PROGRESS"; doc.missions[3].status = "WAITING";
    const s = snapshot(); const save = vi.fn();
    const view = render(<ActionPanel doc={doc} snapshot={s} schoolId="a" weekly save={save} busy={false} />);
    expect(screen.queryByRole("button", { name: /目標に適用/ })).toBeNull();
    doc.missions[2].status = "NOT_STARTED"; doc.missions[3].status = "NOT_STARTED";
    s.reviews = null;
    view.rerender(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={3} save={save} busy={false} />);
    expect(screen.queryByRole("button", { name: /目標に適用/ })).toBeNull();
  });
  it("does not claim a manual theme was a demand measurement or publication", () => {
    render(<ActionPanel doc={challengeDocument()} snapshot={snapshot()} schoolId="a" day={5} save={vi.fn()} busy={false} />);
    expect(screen.getByText("判定根拠：手動テーマ")).toBeDefined();
    expect(screen.getByText(/下書きだけでは公開完了になりません/)).toBeDefined();
  });
  it("shows empty recommendations without synthesizing new problems", () => {
    const s = snapshot(); const doc = challengeDocument();
    for (const day of [1, 2, 7]) doc.missions[day - 1].evidence = completeCommand(day).evidence;
    const view = render(<ActionPanel doc={doc} snapshot={s} schoolId="a" day={2} save={vi.fn()} busy={false} />);
    expect(screen.getByText(/新しい優先提案はありません/)).toBeDefined();
    for (const day of [3, 4, 5, 6]) { doc.missions[day - 1].completedAt = s.at; doc.missions[day - 1].status = "COMPLETED"; }
    s.reviews!.pending = 0; s.latestReviewAt = s.at; s.reviews!.count = 20;
    view.rerender(<ActionPanel doc={doc} snapshot={s} schoolId="a" save={vi.fn()} busy={false} />);
    expect(screen.queryByRole("listitem")).toBeNull();
  });
  it.each([undefined, 0, 1, 2])("reports real inquiry counts without clamping or converting unknown (%s)", count => {
    const doc = challengeDocument(); const s = snapshot(); s.at = "2026-10-10T09:00:00Z";
    if (count !== undefined) doc.inquiries = { google: count, unknown: 3, other: 1, tests: 99, recordedAt: s.at, actorId: "u" };
    render(<ChallengeGoal doc={doc} snapshot={s} />);
    expect(screen.getByText(new RegExp(`実績：${count === undefined ? "未計測" : `${count}件`}`))).toBeDefined();
    expect(screen.getByText(/開始から10日目/)).toBeDefined();
    expect(screen.queryByText("成果目標達成") !== null).toBe(count !== undefined && count > 0);
  });
  it("reports completed and residual improvements separately after all days", () => {
    const s = snapshot(); let doc = updateNextAction(challengeDocument(), { action: "next-action", key: "pending-replies", status: "IN_PROGRESS", note: "" }, s, "u");
    doc = updateNextAction(doc, { action: "next-action", key: "pending-replies", status: "COMPLETED", note: "返信確認" }, s, "u");
    doc = updateNextAction(doc, { action: "next-action", key: "request-reviews", status: "IN_PROGRESS", note: "" }, s, "u");
    doc.completedAt = s.at;
    render(<ChallengeGoal doc={doc} snapshot={s} />);
    expect(screen.getByText(/保存した提案：2件 \/ 完了した改善：1件 \/ 対応中・残課題：1件/)).toBeDefined();
  });
});

it("shows bounded failure context alongside TOP1 without treating old demand as current", () => {
  const s = { ...snapshot(), demandStatus: "API_ERROR" as const, demandStage: "OAUTH" as const, demandHttpStatus: 400 };
  render(<ActionPanel doc={challengeDocument()} snapshot={s} schoolId="a" save={vi.fn()} busy={false} />);
  expect(screen.getByRole("status", { name: "検索需要の取得状態" }).textContent).toContain("認証情報の更新で失敗しました（HTTP 400）");
  expect(screen.getByRole("status", { name: "検索需要の取得状態" }).textContent).toContain("情報不足のため未判定");
});
