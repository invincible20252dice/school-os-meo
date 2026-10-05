// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChallengeClient, { type ChallengeView } from "./challenge-client";
import { missions, startChallenge, updateChallenge, weeklyActions } from "@/lib/challenge";
import { challengeDocument, completeCommand, snapshot } from "@/test/challenge-fixtures";
const route = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=a") }));
const session = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useSearchParams: () => route.params }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: session } }) }));
const payload = (): ChallengeView => ({ success: true, school: { id: "a", name: "校舎A", phoneNumber: "000", addressLine: "登録住所", websiteUrl: "https://example.com" }, document: challengeDocument(), version: 1, snapshot: snapshot(), surveys: [{ id: "survey-1", title: "通塾アンケート" }], actions: [] });
const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (v: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let body: ChallengeView;
let commands: Record<string, unknown>[];
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  route.params = new URLSearchParams("schoolId=a"); commands = []; body = payload();
  session.mockReset().mockResolvedValue({ data: { session: { access_token: "token" } } });
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    if (init?.method === "POST") {
      const command = JSON.parse(init.body); commands.push(command);
      try {
        body.document = command.action === "start" ? startChallenge(command.additionalTarget, body.snapshot) : updateChallenge(body.document!, command, body.snapshot, "actor");
        body.version++; return Response.json({ success: true });
      } catch (error) { return Response.json({ success: false, error: (error as Error).message }, { status: 400 }); }
    }
    body.actions = body.document ? weeklyActions(body.document, body.snapshot) : [];
    return Response.json(body);
  }));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const load = async (weekly = false) => { const view = render(<ChallengeClient weekly={weekly} />); await screen.findByText("校舎A"); return view; };
describe("challenge UI", () => {
  it("opens a guide without writing, navigates to the matching task, and saves with the existing version/CLEAR logic", async () => {
    body.document = updateChallenge(body.document!, completeCommand(1), body.snapshot, "actor");
    body.document!.missions[1].evidence = { ...completeCommand(2).evidence, photo0: "要改善" };
    route.params.set("day", "2");
    await load();
    const next = screen.getByRole("region", { name: "次にやること" });
    const details = next.querySelector("details")!;
    act(() => { details.open = true; fireEvent(details, new Event("toggle")); });
    await within(next).findByText("おすすめ例");
    expect(commands).toEqual([]);
    fireEvent.click(within(next).getByRole("button", { name: "確認・実行記録へ進む" }));
    expect(document.activeElement?.id).toBe("challenge-day-2-photo0");
    fireEvent.click(screen.getByRole("radio", { name: "追加済み" }));
    expect(commands).toEqual([]);
    fireEvent.click(within(screen.getByRole("region", { name: "DAY2の完了条件" })).getByRole("button", { name: "DAY2を完了する" }));
    await screen.findByText("✓ DAY2 完了");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ action: "mission", day: 2, version: 1, evidence: { photo0: "追加済み" } });
    expect(screen.getByRole("link", { name: /次のDAY3/ })).toBeTruthy();
  });
  it("keeps only one photo editor open, preserves unsaved edits and moves from the sticky action to completion", async () => {
    body.document = updateChallenge(body.document!, completeCommand(1), body.snapshot, "actor");
    body.document!.missions[1].evidence = { ...completeCommand(2).evidence, photo3: "後で対応" };
    route.params.set("day", "2");
    await load();
    const sticky = screen.getByLabelText("DAY2の操作");
    fireEvent.click(within(sticky).getByRole("button", { name: "未完了項目へ移動" }));
    expect(document.activeElement?.id).toBe("challenge-day-2-photo3");
    fireEvent.click(screen.getByRole("radio", { name: "追加済み" }));
    fireEvent.click(screen.getByRole("button", { name: "一覧に戻る" }));
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    expect(screen.getByText(/未保存の変更があります/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "授業を変更" }));
    expect((screen.getByRole("radio", { name: "追加済み" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "授業を変更" }));
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    fireEvent.click(within(sticky).getByRole("button", { name: "DAY2を完了する" }));
    expect(document.activeElement?.id).toBe("challenge-day-2-status");
    expect(commands).toEqual([]);
    const region = screen.getByRole("region", { name: "DAY2詳細" });
    for (const label of ["全体・DAY別の進捗一覧", "連携・データ取得情報", "管理用の詳細を見る"]) {
      expect(region.compareDocumentPosition(screen.getByText(label)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
  it.each(["追加済み", "既存写真で充足"])("completes DAY2 using only %s answers, restores them, and offers DAY3", async answer => {
    route.params.set("day", "2");
    body.document = updateChallenge(body.document!, completeCommand(1), body.snapshot, "actor");
    await load();
    expect(screen.queryByLabelText("進捗状態")).toBeNull();
    expect(screen.getByRole("button", { name: "確認内容を保存" })).toBeDefined();
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    for (const field of missions[1].fields) {
      fireEvent.click(screen.getByRole("button", { name: `${field.label}を確認する` }));
      expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
      fireEvent.click(within(screen.getByRole("radiogroup", { name: field.label })).getByRole("radio", { name: answer }));
    }
    expect(screen.getByText("DAY2完了条件を満たしました。")).toBeDefined();
    expect(screen.getByRole("region", { name: "現在取り組むDAY" }).textContent).toContain("8 / 8");
    fireEvent.click(within(screen.getByRole("region", { name: "DAY2の完了条件" })).getByRole("button", { name: "DAY2を完了する" }));
    await screen.findByText("✓ DAY2 完了");
    expect(screen.getByText("DAY2の内容を見る").closest("details")?.open).toBe(false);
    fireEvent.click(screen.getByText("DAY2の内容を見る"));
    expect(commands[0]).toMatchObject({ status: "COMPLETED", note: "", version: 1 });
    expect(screen.getByRole("link", { name: /次のDAY3/ })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "最新データに更新" }));
    await screen.findByText("✓ DAY2 完了");
    expect((screen.getByLabelText("確認メモ（任意）") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByText("DAY2の内容を見る"));
    fireEvent.click(screen.getByRole("button", { name: "外観を変更" }));
    expect((screen.getByRole("radio", { name: answer }) as HTMLInputElement).checked).toBe(true);
  });
  it("shows an exemption reason next to the relevant category and preserves it after save", async () => {
    route.params.set("day", "2");
    body.document!.missions[1].evidence = { ...completeCommand(2).evidence, photo7: "対象外" };
    await load();
    fireEvent.click(screen.getByRole("button", { name: "駐車場・駐輪場を変更" }));
    const group = screen.getByRole("radiogroup", { name: "駐車場・駐輪場" });
    const reason = within(group).getByLabelText("対象外の理由（駐車場・駐輪場）");
    expect(screen.getByText("DAY2完了まであと1カテゴリ")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "確認内容を保存" }));
    await screen.findByText("写真の確認内容を保存しました。");
    expect(body.document!.missions[1].status).toBe("IN_PROGRESS");
    fireEvent.click(screen.getByRole("button", { name: "駐車場・駐輪場を変更" }));
    fireEvent.change(screen.getByLabelText("対象外の理由（駐車場・駐輪場）"), { target: { value: "専用駐車場がないため" } });
    expect(reason).toBeDefined();
    fireEvent.click(within(screen.getByRole("region", { name: "DAY2の完了条件" })).getByRole("button", { name: "DAY2を完了する" }));
    await screen.findByText("✓ DAY2 完了");
    expect(body.document!.missions[1].note).toBe("専用駐車場がないため");
  });
  it.each([["あとで確認", "後で対応", "WAITING"], ["いいえ", "要改善", "IN_PROGRESS"]])("explains the remaining DAY2 %s and saves without memo", async (label, value, status) => {
    route.params.set("day", "2");
    body.document = updateChallenge(body.document!, completeCommand(1), body.snapshot, "actor");
    body.document!.missions[1].evidence = completeCommand(2).evidence;
    await load();
    fireEvent.click(screen.getByRole("button", { name: "授業を変更" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "授業" })).getByRole("radio", { name: label }));
    const remaining = screen.getByRole("region", { name: "DAY2の完了条件" });
    expect(remaining.textContent).toContain(`授業：${label}になっています`);
    fireEvent.click(within(remaining).getByRole("button", { name: "最初の未完了項目へ移動" }));
    expect(document.activeElement?.id).toBe("challenge-day-2-photo3");
    expect(screen.queryByRole("button", { name: "DAY2を完了する" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "確認内容を保存" }));
    await screen.findByText("写真の確認内容を保存しました。");
    expect(body.document!.missions[1]).toMatchObject({ status, note: "", evidence: { photo3: value } });
    expect(screen.getByRole("region", { name: "次にやること" }).textContent).toContain("授業を確認しましょう");
    fireEvent.change(screen.getByLabelText("確認メモ（任意）"), { target: { value: "来週確認します" } });
    fireEvent.click(screen.getByRole("button", { name: "確認内容を保存" }));
    await waitFor(() => expect(body.document!.missions[1].note).toBe("来週確認します"));
  });
  it.each([true, false])("focuses the current task from a future DAY without changing saved progress (reduced motion %s)", async reduced => {
    body.document = updateChallenge(body.document!, completeCommand(1), body.snapshot, "actor");
    body.document!.missions[1].evidence = completeCommand(2).evidence;
    delete body.document!.missions[1].evidence.photo3; delete body.document!.missions[1].evidence.photo4;
    route.params.set("day", "4");
    const scroll = vi.fn(); HTMLElement.prototype.scrollIntoView = scroll;
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced })));
    const saved = structuredClone(body.document);
    const view = await load();
    expect(screen.getByRole("region", { name: "現在取り組むDAY" }).textContent).toContain("DAY 2 / 7");
    expect(screen.getByText(/DAY4を閲覧しています/)).toBeDefined();
    expect(screen.getByRole("region", { name: "次にやること" }).textContent).toContain("授業を確認しましょう");
    fireEvent.click(screen.getByRole("button", { name: "未完了項目へ移動 →" }));
    await screen.findByRole("radiogroup", { name: "授業" });
    expect(document.activeElement?.id).toBe("challenge-day-2-photo3");
    expect(scroll).toHaveBeenCalledWith({ behavior: reduced ? "auto" : "smooth", block: "center" });
    expect(body.document).toEqual(saved); expect(commands).toEqual([]);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "授業" })).getByRole("radio", { name: "追加済み" }));
    fireEvent.click(screen.getByRole("button", { name: "確認内容を保存" }));
    await screen.findByText("写真の確認内容を保存しました。");
    expect(screen.getByRole("region", { name: "次にやること" }).textContent).toContain("自習を確認しましょう");
    expect(body.document!.missions[1].evidence.photo0).toBe(saved!.missions[1].evidence.photo0);
    expect(body.document!.missions[0].completedAt).toBe(saved!.missions[0].completedAt);
    route.params.set("day", "1"); view.rerender(<ChallengeClient />);
    expect(screen.getByText("✓ DAY1 完了")).toBeDefined();
  });
  it("offers a completion-record action, not a false CLEAR, once all checks are recorded", async () => {
    body.document!.missions[0].evidence = completeCommand(1).evidence;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    await load();
    expect(screen.queryByText("✓ DAY1 完了")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "DAY1を完了する →" }));
    expect(document.activeElement?.id).toBe("challenge-day-1-status");
    expect(commands).toEqual([]);
    await waitFor(() => expect(document.activeElement?.className).not.toContain("taskHighlight"), { timeout: 3500 });
  });
  it("keeps lightweight warnings and detailed data below the single primary action", async () => {
    body.snapshot.errors = ["Instagramデータ取得失敗"];
    await load();
    const task = screen.getByRole("region", { name: "次にやること" });
    const warning = screen.getByText("一部データ未取得（1件）");
    expect(task.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(warning.closest("details")?.open).toBe(false);
    expect(screen.getByText("管理用の詳細を見る").closest("details")?.open).toBe(false);
    expect(screen.getByText("メモを追加する（任意）").closest("details")?.open).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["はい", "修正済み"])("saves DAY1 %s without a note, reloads DB data, and stays on its CLEAR view", async answer => {
    const view = await load();
    for (const field of missions[0].fields) fireEvent.click(within(screen.getByRole("radiogroup", { name: field.label })).getByRole("radio", { name: answer }));
    fireEvent.change(screen.getByLabelText("進捗状態"), { target: { value: "COMPLETED" } });
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await screen.findByText("実行記録を保存しました。");
    expect(screen.getByText("✓ DAY1 完了")).toBeDefined();
    fireEvent.click(screen.getByText("このDAYの成果・達成率を見る"));
    expect(screen.getByRole("progressbar", { name: "DAY1 ミッション達成率" }).getAttribute("value")).toBe("100");
    expect(commands[0]).toMatchObject({ action: "mission", day: 1, status: "COMPLETED", note: "", version: 1 });
    expect(body.document!.missions[0].completedAt).toBe(snapshot().at);
    expect(fetch).toHaveBeenCalledTimes(3);
    view.unmount(); route.params.set("day", "1"); await load();
    expect(screen.getByText("✓ DAY1 完了")).toBeDefined();
    expect((screen.getByLabelText("進捗状態") as HTMLSelectElement).value).toBe("COMPLETED");
  });
  it("does not claim fresh progress when saving succeeds but the following GET fails", async () => {
    await load();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementationOnce(original).mockRejectedValueOnce(new Error("offline"));
    fireEvent.change(screen.getByLabelText("実行記録・残課題の理由"), { target: { value: "再取得失敗の確認" } });
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await screen.findByText("保存は完了しましたが、最新状態を取得できませんでした。「最新データに更新」で確認してください。");
    expect(body.version).toBe(2);
    expect(screen.queryByText("実行記録を保存しました。")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "最新データに更新" }));
    await screen.findByText("校舎A");
    expect((screen.getByLabelText("実行記録・残課題の理由") as HTMLTextAreaElement).value).toBe("再取得失敗の確認");
  });
  it("ignores the old school's post-save refresh after a school switch", async () => {
    const view = await load(); const pending = deferred<Response>();
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementationOnce(original).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    const old = structuredClone(body);
    route.params = new URLSearchParams("schoolId=b"); body = { ...payload(), school: { ...payload().school, id: "b", name: "校舎B" } };
    view.rerender(<ChallengeClient />); await screen.findByText("校舎B");
    await act(async () => pending.resolve(Response.json(old)));
    expect(screen.queryByText("校舎A")).toBeNull();
    expect(screen.queryByText("実行記録を保存しました。")).toBeNull();
  });
  it("distinguishes unrecorded request counts from explicitly recorded zero", async () => {
    body.document!.missions[3].evidence.requested = 0;
    await load();
    expect(screen.getByText("DAY3：未計測 / DAY4：0名")).toBeDefined();
  });
  it("starts with a saved target and server-owned baseline, and navigates with school scope", async () => {
    body.document = null; body.version = 0;
    await load();
    fireEvent.change(screen.getByLabelText("DAY4の追加依頼目標人数"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "チャレンジを開始" }));
    await screen.findByText("7つのDAYのうち0つ完了");
    expect(commands).toEqual([{ action: "start", additionalTarget: 12, version: 0 }]);
    expect(body.document).toMatchObject({ additionalTarget: 12 });
    expect(screen.queryAllByText("DB未設定", { exact: false })).toHaveLength(0);
    for (const a of screen.getAllByRole("link")) {
      const href = a.getAttribute("href")!;
      if (!href.startsWith("#")) expect(href).toContain("schoolId=a");
    }
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/challenge?schoolId=a", expect.objectContaining({ headers: { authorization: "Bearer token" }, cache: "no-store" }));
  });
  it.each([1, 3, 4, 5, 6, 7])("records DAY%s through the real validation logic and restores it after reload", async day => {
    route.params.set("day", String(day));
    await load();
    const command = completeCommand(day);
    for (const field of missions[day - 1].fields) {
      const value = String(command.evidence[field.key]);
      if (field.question) fireEvent.click(within(screen.getByRole("radiogroup", { name: field.label })).getByRole("radio", { name: value === "確認済み" || value === "実施済み" ? "はい" : value }));
      else fireEvent.change(screen.getByLabelText(field.label), { target: { value } });
    }
    fireEvent.change(screen.getByLabelText("実行記録・残課題の理由"), { target: { value: "完了を現地確認" } });
    fireEvent.change(screen.getByLabelText("進捗状態"), { target: { value: "COMPLETED" } });
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await screen.findByText("7つのDAYのうち1つ完了");
    expect(body.document!.missions[day - 1]).toMatchObject({ status: "COMPLETED", note: "完了を現地確認", evidence: command.evidence });
    fireEvent.click(screen.getByRole("button", { name: "最新データに更新" }));
    await screen.findByText("7つのDAYのうち1つ完了");
    expect((screen.getByLabelText("実行記録・残課題の理由") as HTMLTextAreaElement).value).toBe("完了を現地確認");
    expect(screen.getByText(/完了記録：/)).toBeDefined();
  });
  it("does not treat copying a request as sending it", async () => {
    route.params.set("day", "3"); await load();
    fireEvent.click(screen.getByRole("button", { name: "依頼文・URLをコピー" }));
    await screen.findByText("依頼文をコピーしました。送信後に実際の依頼人数を記録してください。");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("schoolId=a&surveyId=survey-1"));
    expect(commands).toEqual([]);
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error());
    fireEvent.click(screen.getByRole("button", { name: "依頼文・URLをコピー" }));
    await screen.findByText("コピーできませんでした。アンケート一覧でURLを確認してください。");
  });
  it("preserves incomplete inputs on validation errors and separates deferred status from complete", async () => {
    route.params.set("day", "3"); await load();
    fireEvent.change(screen.getByLabelText(missions[2].fields[0].label), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("進捗状態"), { target: { value: "COMPLETED" } });
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await screen.findByText("実行内容・対象外の理由・確認待ちの内容を記録してください。");
    fireEvent.change(screen.getByLabelText("進捗状態"), { target: { value: "DEFERRED" } });
    fireEvent.change(screen.getByLabelText("実行記録・残課題の理由"), { target: { value: "来週対応" } });
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await waitFor(() => expect(body.document!.missions[2].status).toBe("DEFERRED"));
    await screen.findByText("7つのDAYのうち0つ完了");
  });
  it("records real inquiries by known source separately from test counts", async () => {
    await load();
    fireEvent.click(screen.getByText("実行と成果・問い合わせ記録"));
    for (const label of ["Google経由の実問い合わせ", "流入元不明の実問い合わせ", "その他の実問い合わせ", "テスト問い合わせ（成果対象外）"]) fireEvent.change(screen.getByLabelText(label), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Google経由の実問い合わせ"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Google経由の実問い合わせ"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "問い合わせ記録を保存" }));
    await waitFor(() => expect(body.document!.inquiries).toMatchObject({ google: 1, unknown: 2, other: 2, tests: 2 }));
    await screen.findByText("校舎A");
    expect((screen.getByLabelText("Google経由の実問い合わせ") as HTMLInputElement).value).toBe("1");
  });
  it("renders completion with frozen results without claiming inquiry success", async () => {
    for (let day = 1; day <= 7; day++) body.document = updateChallenge(body.document!, completeCommand(day), body.snapshot, "actor");
    await load();
    expect(screen.getByText("7 / 7 DAY 完了")).toBeDefined();
    expect(screen.getByText("7つの実行記録がそろいました")).toBeDefined();
    expect(screen.getByText(/完了時スナップショット保存/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "実行記録を保存" })).toBeNull();
  });
  it("records weekly actions without bypassing day completion requirements", async () => {
    body.snapshot.google = false; await load(true);
    const notes = screen.getAllByLabelText("対応記録");
    fireEvent.change(notes[0], { target: { value: "連携確認済み" } });
    fireEvent.change(screen.getAllByLabelText("対応状態")[0], { target: { value: "COMPLETED" } });
    fireEvent.click(screen.getAllByRole("button", { name: "対応を保存" })[0]);
    await waitFor(() => expect(body.document!.actions["google-connect"]).toMatchObject({ status: "COMPLETED", note: "連携確認済み" }));
    await screen.findByText("今週のアクション", { selector: "h1" });
    expect(body.document!.missions.every(m => m.status === "NOT_STARTED")).toBe(true);
  });
  it("shows an empty weekly list only when no pending work is recorded", async () => {
    for (let day = 1; day <= 7; day++) body.document = updateChallenge(body.document!, completeCommand(day), body.snapshot, "actor");
    body.snapshot.reviews!.pending = 0; body.snapshot.posts = { count: 1, latestAt: body.snapshot.at };
    await load(true); expect(screen.getByText("現在、記録が必要なアクションはありません。")).toBeDefined();
  });
  it("shows missing integrations, comparisons, survey data and null measurements explicitly", async () => {
    body.school.phoneNumber = null; body.school.addressLine = null; body.school.websiteUrl = null;
    body.snapshot = { ...body.snapshot, google: null, instagram: null, reviews: null, posts: null, comparisons: null, errors: ["口コミを取得できませんでした。"] };
    body.document!.baseline = body.snapshot;
    const view = await load(); expect(screen.getByText("一部データ未取得（1件）").closest("details")?.open).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/Google連携：取得失敗/)).toBeDefined();
    expect(screen.getAllByText(/DB未設定/)).toHaveLength(3);
    route.params.set("day", "6"); view.rerender(<ChallengeClient />);
    expect(screen.getByText(/保存済み競合データがありません/)).toBeDefined();
    body.surveys = []; route.params.set("day", "4");
    fireEvent.click(screen.getByRole("button", { name: "最新データに更新" }));
    await screen.findByText(/有効なアンケートがありません/);
  });
  it("recommends deferred missions when all unfinished work was deferred", async () => {
    body.document!.missions.forEach(m => m.status = "DEFERRED"); body.snapshot.instagram = true;
    await load(); expect(screen.getByRole("region", { name: "現在取り組むDAY" }).textContent).toContain("DAY 1 / 7"); expect(screen.getByText(/Instagram：設定済み/)).toBeDefined();
  });
  it.each(["", "schoolId=all"])("requires a selected school (%s)", async query => {
    route.params = new URLSearchParams(query); render(<ChallengeClient />);
    await screen.findByText("ヘッダーで対象の校舎を選択してください。"); expect(fetch).not.toHaveBeenCalled();
  });
  it("requires login", async () => {
    session.mockResolvedValue({ data: { session: null } }); render(<ChallengeClient />);
    await screen.findByText("ログイン後に集客チャレンジを確認してください。"); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["error", "empty", "throw"])("handles failed loading and retries (%s)", async kind => {
    const mock = vi.mocked(fetch);
    if (kind === "throw") mock.mockRejectedValueOnce(null);
    else mock.mockResolvedValueOnce(Response.json(kind === "error" ? { error: "権限エラー" } : {}, { status: 403 }));
    render(<ChallengeClient />); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "最新データに更新" })); await screen.findByText("校舎A");
  });
  it.each(["logout", "refused", "network"])("does not report failed saves as completed (%s)", async kind => {
    await load();
    if (kind === "logout") session.mockResolvedValue({ data: { session: null } });
    if (kind === "refused") vi.mocked(fetch).mockResolvedValueOnce(Response.json({}, { status: 503 }));
    if (kind === "network") vi.mocked(fetch).mockRejectedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await screen.findByText(kind === "logout" ? "ログインし直してください。" : "保存できませんでした。");
    expect(body.document!.missions[0].status).toBe("NOT_STARTED");
  });
  it("ignores old-school loads and protects saving from duplicate clicks", async () => {
    const old = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(old.promise);
    const view = render(<ChallengeClient />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    route.params = new URLSearchParams("schoolId=b"); body.school = { ...body.school, id: "b", name: "校舎B" };
    view.rerender(<ChallengeClient />); await screen.findByText("校舎B");
    await act(async () => old.resolve(Response.json(payload())));
    expect(screen.queryByText("校舎A")).toBeNull();
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const form = screen.getByRole("button", { name: "実行記録を保存" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await act(async () => pending.resolve(Response.json({ success: true })));
  });
  it("cancels a save awaiting authentication when the school changes", async () => {
    const view = await load(); const auth = deferred<{ data: { session: { access_token: string } } }>();
    session.mockReturnValueOnce(auth.promise);
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    route.params = new URLSearchParams("schoolId=b"); body.school = { ...body.school, id: "b", name: "校舎B" };
    view.rerender(<ChallengeClient />); await screen.findByText("校舎B");
    await act(async () => auth.resolve({ data: { session: { access_token: "old" } } }));
    expect(commands).toEqual([]);
  });
  it.each([true, false])("ignores stale save responses after switching schools (success=%s)", async success => {
    const view = await load(); const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: "実行記録を保存" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    route.params = new URLSearchParams("schoolId=b"); body.school = { ...body.school, id: "b", name: "校舎B" };
    view.rerender(<ChallengeClient />); await screen.findByText("校舎B");
    await act(async () => pending.resolve(Response.json({ success, error: "old error" }, { status: success ? 200 : 409 })));
    expect(screen.queryByText("old error")).toBeNull(); expect(screen.getByText("校舎B")).toBeDefined();
  });
  it("ignores an aborted load error after unmount", async () => {
    const pending = deferred<Response>(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const view = render(<ChallengeClient />); await waitFor(() => expect(fetch).toHaveBeenCalled()); view.unmount();
    await act(async () => pending.reject(new Error("aborted")));
  });
});
