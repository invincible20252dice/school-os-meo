import { test, expect, installFixture, secondSyntheticUserId, type FixtureState } from "./fixtures";
import type { Page, TestInfo } from "@playwright/test";
import { LEAD_RECOVERY_STORAGE_KEY, LEAD_RECOVERY_MAX_AGE_MS, LEAD_RECOVERY_CHANGED } from "../src/lib/google-lead-recovery-storage";

const route = "/dashboard/roi?schoolId=school-a";
const recovery = (page: Page) => page.getByRole("region", { name: "前回の登録", exact: true });
const line = (page: Page) => page.getByRole("button", { name: "LINE +1", exact: true });
const confirmation = (page: Page) => page.getByRole("dialog", { name: "新しい問い合わせの確認", exact: true });
const posts = (fixture: FixtureState) => fixture.leadServer.events.filter(event => event.kind === "post-received");
const commits = (fixture: FixtureState) => fixture.leadServer.events.filter(event => event.kind === "post-committed");
const statusReads = (fixture: FixtureState) => fixture.leadServer.events.filter(event => event.kind === "status-response");
const stored = (page: Page) => page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "[]") as Array<{ operationId: string; startedAt: number; state: string }>, LEAD_RECOVERY_STORAGE_KEY);
const count = async (page: Page, expected: number) => {
  await expect(page.getByRole("region", { name: "実際の成果" })).toContainText(`期間内の問い合わせ ${expected}件のうち、集計終了までに面談実施 0件・入塾 0件`);
};
async function evidence(page: Page, fixture: FixtureState, testInfo: TestInfo, name: string) {
  const outcomes = page.getByRole("region", { name: "実際の成果" });
  const visibleCount = await outcomes.count() ? (await outcomes.innerText()).match(/期間内の問い合わせ (\d+)件/) : null;
  await testInfo.attach(`${name}-server-evidence`, { contentType: "application/json", body: JSON.stringify({
    boundary: "synthetic authenticated API; no production access or real OAuth", viewport: testInfo.project.name,
    phase: name, displayedInquiries: visibleCount ? Number(visibleCount[1]) : null,
    serverEvents: fixture.leadServer.events, rows: fixture.leadServer.count("school-a"), posts: posts(fixture).length,
    insertCommits: commits(fixture).length, retainedOperations: await stored(page),
  }, null, 2) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}
async function uncertainSave(page: Page, fixture: FixtureState) {
  fixture.failNextLeadResponseAfterSave = true;
  await line(page).click();
  await expect(recovery(page)).toBeVisible();
  await expect.poll(async () => (await stored(page)).some(op => op.state === "response_unknown")).toBe(true);
  expect(posts(fixture)).toHaveLength(commits(fixture).length);
}

test("normal save followed by same-tab reload never replays a POST", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0);
  await line(page).click(); await count(page, 1);
  await expect.poll(() => stored(page)).toEqual([]);
  await page.reload(); await count(page, 1);
  await expect(recovery(page)).toHaveCount(0);
  expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(1);
  expect(statusReads(fixture)).toHaveLength(0);
  await evidence(page, fixture, testInfo, "normal-reload-one");
});

test("saved response loss reload performs status read and confirms one existing inquiry", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0);
  await uncertainSave(page, fixture);
  const original = posts(fixture)[0].idempotencyKey;
  expect((await stored(page))[0].operationId).toBe(original);
  await page.reload(); await count(page, 1);
  await expect(page.getByRole("status").filter({ hasText: "前回の問い合わせは保存済みです。重複登録していません。" })).toBeVisible();
  await expect(recovery(page)).toHaveCount(0);
  expect(statusReads(fixture).map(event => [event.idempotencyKey, event.operationState])).toEqual([[original, "saved"]]);
  expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(1);
  expect(await stored(page)).toEqual([]);
  await evidence(page, fixture, testInfo, "lost-response-reload-confirmed-one");
});

test("explicit synthetic cancellation before commit reload offers only explicit same-key retry", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0);
  const barrier = fixture.leadServer.blockNextPostBeforeCommit();
  await line(page).click(); const original = await barrier.received;
  barrier.cancel(); await barrier.cancelled;
  await expect.poll(async () => (await stored(page))[0]?.state).toBe("response_unknown");
  expect(commits(fixture)).toHaveLength(0);
  await page.reload(); await count(page, 0);
  await expect(recovery(page)).toContainText("現在、保存された登録が見つかりません");
  expect(posts(fixture)).toHaveLength(1);
  await recovery(page).getByRole("button", { name: "前回の登録を再試行", exact: true }).click();
  await count(page, 1); await expect(recovery(page)).toHaveCount(0);
  expect(posts(fixture).map(event => event.idempotencyKey)).toEqual([original.idempotencyKey, original.idempotencyKey]);
  expect(commits(fixture)).toHaveLength(1); expect(await stored(page)).toEqual([]);
  await evidence(page, fixture, testInfo, "cancelled-before-commit-explicit-retry-one");
});

test("an absent snapshot followed by delayed original commit still retries the identical key once", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0);
  const barrier = fixture.leadServer.blockNextPostBeforeCommit();
  await line(page).click(); const original = await barrier.received;
  await page.reload(); await count(page, 0);
  await expect(recovery(page)).toContainText("現在、保存された登録が見つかりません");
  expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(0);
  barrier.commit();
  await expect.poll(() => commits(fixture).length).toBe(1);
  await recovery(page).getByRole("button", { name: "前回の登録を再試行", exact: true }).click();
  await count(page, 1); await expect(recovery(page)).toHaveCount(0);
  expect(posts(fixture).map(event => event.idempotencyKey)).toEqual([original.idempotencyKey, original.idempotencyKey]);
  expect(commits(fixture)).toHaveLength(1);
  await evidence(page, fixture, testInfo, "late-commit-same-key-one");
});

test("POST success then list failure and status failure across reload retains uncertainty without resending", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0);
  fixture.failNextLeadRead = true; fixture.failLeadStatus = true;
  await line(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "保存済みですが一覧を再取得できませんでした。" })).toBeVisible();
  expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(1);
  await page.reload(); await count(page, 1);
  await expect(recovery(page)).toContainText("登録状態を確認できません");
  expect(posts(fixture)).toHaveLength(1); expect(await stored(page)).toHaveLength(1);
  await evidence(page, fixture, testInfo, "acknowledged-post-read-status-failed");
  fixture.failLeadStatus = false;
  await recovery(page).getByRole("button", { name: "前回の登録状態を確認", exact: true }).click();
  await expect(recovery(page)).toHaveCount(0); await count(page, 1);
  expect(posts(fixture)).toHaveLength(1); expect(await stored(page)).toEqual([]);
});

test("new +1 requires confirmation; cancel and status-check choices create no second inquiry", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0); await uncertainSave(page, fixture);
  await line(page).click(); await expect(confirmation(page)).toBeVisible();
  await expect(confirmation(page)).toContainText("確認できていない前回の登録があります。");
  expect(posts(fixture)).toHaveLength(1);
  await confirmation(page).getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(confirmation(page)).not.toBeVisible();
  expect(posts(fixture)).toHaveLength(1); expect(await stored(page)).toHaveLength(1);
  await line(page).click();
  await confirmation(page).getByRole("button", { name: "前回の登録状態を確認する", exact: true }).click();
  await expect(recovery(page)).toHaveCount(0); await count(page, 1);
  expect(posts(fixture)).toHaveLength(1);
  await evidence(page, fixture, testInfo, "new-inquiry-cancel-and-check-no-second-post");
});

test("two uncertain operations retain separate keys until each status is confirmed", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0); await uncertainSave(page, fixture);
  fixture.failNextLeadResponseAfterSave = true; fixture.failLeadStatus = true;
  await page.getByRole("button", { name: "電話 +1", exact: true }).click();
  await expect(confirmation(page)).toBeVisible();
  expect(posts(fixture)).toHaveLength(1);
  await evidence(page, fixture, testInfo, "new-inquiry-awaits-confirmation");
  await confirmation(page).getByRole("button", { name: "新しい問い合わせとして登録する", exact: true }).click();
  await expect.poll(async () => (await stored(page)).filter(op => op.state === "response_unknown").length).toBe(2);
  const keys = posts(fixture).map(event => event.idempotencyKey);
  expect(new Set(keys).size).toBe(2); expect(commits(fixture)).toHaveLength(2);
  await page.reload(); await count(page, 2);
  await expect(recovery(page).getByRole("article")).toHaveCount(2);
  await expect(recovery(page).getByText("登録状態を確認できません", { exact: true })).toHaveCount(2);
  expect(posts(fixture)).toHaveLength(2);
  expect((await stored(page)).map(op => op.operationId)).toEqual(keys);
  await evidence(page, fixture, testInfo, "two-uncertain-operations-retained");
  fixture.failLeadStatus = false;
  await recovery(page).getByRole("button", { name: "前回の登録状態を確認", exact: true }).first().click();
  await expect(recovery(page).getByRole("article")).toHaveCount(1);
  await recovery(page).getByRole("button", { name: "前回の登録状態を確認", exact: true }).click();
  await expect(recovery(page)).toHaveCount(0);
  expect(posts(fixture)).toHaveLength(2); expect(await stored(page)).toEqual([]);
});

for (const edited of ["saved", "changed", "deleted"] as const) {
  test(`409 after a delayed ${edited} original is resolved by status without recreating a row`, async ({ page, fixture }, testInfo) => {
    await page.goto(route); await count(page, 0);
    const barrier = fixture.leadServer.blockNextPostBeforeCommit();
    await line(page).click(); const original = await barrier.received;
    await page.reload(); await count(page, 0);
    await expect(recovery(page)).toContainText("現在、保存された登録が見つかりません");
    barrier.commit(); await expect.poll(() => commits(fixture).length).toBe(1);
    const row = fixture.leadServer.rows.get("school-a")![0];
    if (edited === "deleted") row.deletedAt = new Date();
    else if (edited === "changed") row.channel = "web";
    else fixture.unknownNextLeadConflict = true; // A duplicate response alone is insufficient; the status lookup must prove saved.
    if (edited !== "saved") row.version++;
    await recovery(page).getByRole("button", { name: "前回の登録を再試行", exact: true }).click();
    await expect(recovery(page)).toHaveCount(0);
    await count(page, edited === "deleted" ? 0 : 1);
    expect(posts(fixture).map(event => event.idempotencyKey)).toEqual([original.idempotencyKey, original.idempotencyKey]);
    expect(fixture.leadServer.events.filter(event => event.kind === "post-response").at(-1)?.status).toBe(409);
    expect(statusReads(fixture).at(-1)?.operationState).toBe(edited);
    expect(commits(fixture)).toHaveLength(1); expect(await stored(page)).toEqual([]);
    await evidence(page, fixture, testInfo, `known-409-${edited}-no-recreation`);
  });
}

test("unknown 409 is not treated as saved and never triggers a replacement POST", async ({ page, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0);
  fixture.unknownNextLeadConflict = true; fixture.failLeadStatus = true;
  await line(page).click();
  await expect(recovery(page)).toContainText("登録状態を確認できません");
  expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(0);
  expect(await stored(page)).toHaveLength(1);
  await page.reload(); await count(page, 0);
  await expect(recovery(page)).toContainText("登録状態を確認できません");
  expect(posts(fixture)).toHaveLength(1);
  fixture.failLeadStatus = false;
  await recovery(page).getByRole("button", { name: "前回の登録状態を確認", exact: true }).click();
  await expect(recovery(page)).toContainText("現在、保存された登録が見つかりません");
  await recovery(page).getByRole("button", { name: "前回の登録を再試行", exact: true }).click();
  await count(page, 1);
  expect(posts(fixture)[1].idempotencyKey).toBe(posts(fixture)[0].idempotencyKey);
  expect(commits(fixture)).toHaveLength(1);
  await evidence(page, fixture, testInfo, "unknown-409-manual-same-key-retry");
});

for (const boundary of ["user", "expiry", "route", "logout", "cancel"] as const) {
  test(`${boundary} boundary discards only inquiry recovery metadata`, async ({ page, fixture }, testInfo) => {
    await page.goto(route); await count(page, 0); await uncertainSave(page, fixture);
    await page.evaluate(() => sessionStorage.setItem("unrelated-feature", "preserved"));
    if (boundary === "user") {
      fixture.userId = secondSyntheticUserId;
      await page.evaluate(id => {
        const session = JSON.parse(localStorage.getItem("sb-127-auth-token")!); session.user.id = id;
        localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
      }, secondSyntheticUserId);
      await page.reload(); await count(page, 1);
    } else if (boundary === "expiry") {
      await page.evaluate(({ key, age }) => {
        const operations = JSON.parse(sessionStorage.getItem(key)!);
        operations[0].startedAt = Date.now() - age - 1;
        sessionStorage.setItem(key, JSON.stringify(operations));
      }, { key: LEAD_RECOVERY_STORAGE_KEY, age: LEAD_RECOVERY_MAX_AGE_MS });
      await page.reload(); await count(page, 1);
    } else if (boundary === "route") {
      await page.goto("/dashboard/challenge?schoolId=school-a");
      await expect(page).toHaveURL(/\/dashboard\/challenge/);
    } else if (boundary === "logout") {
      await page.getByRole("link", { name: "ログアウト", exact: true }).click();
      await expect(page).toHaveURL(/\/login/);
    } else {
      await recovery(page).getByRole("button", { name: "この操作の再確認をやめる", exact: true }).click();
    }
    await expect.poll(() => stored(page)).toEqual([]);
    await expect(recovery(page)).toHaveCount(0);
    expect(statusReads(fixture)).toHaveLength(0); expect(posts(fixture)).toHaveLength(1);
    expect(await page.evaluate(() => sessionStorage.getItem("unrelated-feature"))).toBe("preserved");
    await evidence(page, fixture, testInfo, `${boundary}-recovery-discarded`);
  });
}

test("blocked session storage fails closed before registering an inquiry", async ({ page, fixture }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("Synthetic blocked storage", "SecurityError"); } }));
  await page.goto(route); await count(page, 0);
  await expect(page.getByText(/一時保存/)).toBeVisible();
  if (await line(page).isEnabled()) await line(page).click();
  expect(posts(fixture)).toHaveLength(0); expect(commits(fixture)).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath("storage-denied-no-post.png"), fullPage: true });
});

test("a real opener-created tab discards copied recovery state while the original tab retains it", async ({ page, context, fixture }, testInfo) => {
  await page.goto(route); await count(page, 0); await uncertainSave(page, fixture);
  const original = await stored(page);
  const opened = context.waitForEvent("page");
  await page.evaluate(() => window.open("about:blank", "_blank"));
  const child = await opened;
  // Verify the browser actually copied the opener's storage before app code clears it.
  expect(await stored(child)).toEqual(original);
  const childFixture = await installFixture(child, fixture.leadServer);
  await child.goto(route); await count(child, 1);
  expect(await child.evaluate(() => Boolean(window.opener))).toBe(true);
  await expect(recovery(child)).toHaveCount(0); expect(await stored(child)).toEqual([]);
  expect(await stored(page)).toEqual(original);
  expect(posts(fixture)).toHaveLength(1); expect(statusReads(fixture)).toHaveLength(0);
  expect(childFixture.unexpected).toEqual([]);
  await evidence(child, childFixture, testInfo, "copied-opener-state-discarded");
  await child.close();
});

for (const reason of ["cancel", "expiry", "external"] as const) {
  test(`${reason} during acknowledged-save list refresh exposes explicit read recovery`, async ({ page, fixture }, testInfo) => {
    await page.goto(route); await count(page, 0);
    let release!: () => void, received!: () => void, block = true;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const waiting = new Promise<void>(resolve => { received = resolve; });
    await page.route("**/api/dashboard/google-results?**", async intercepted => {
      if (intercepted.request().method() === "GET" && block) {
        block = false; received(); await pending;
      }
      await intercepted.fallback();
    });
    await line(page).click(); await waiting;
    await expect.poll(async () => (await stored(page))[0]?.state).toBe("confirmed");
    if (reason === "cancel") await recovery(page).getByRole("button", { name: "この操作の再確認をやめる", exact: true }).click();
    else await page.evaluate(({ reason, key, age, changed }) => {
      if (reason === "expiry") {
        const rows = JSON.parse(sessionStorage.getItem(key)!); rows[0].startedAt = Date.now() - age;
        sessionStorage.setItem(key, JSON.stringify(rows)); document.dispatchEvent(new Event("visibilitychange"));
      } else { sessionStorage.removeItem(key); window.dispatchEvent(new Event(changed)); }
    }, { reason, key: LEAD_RECOVERY_STORAGE_KEY, age: LEAD_RECOVERY_MAX_AGE_MS, changed: LEAD_RECOVERY_CHANGED });
    const alert = page.getByRole("alert").filter({ hasText: "最新の成果は「再取得」で確認してください。" });
    await expect(alert).toBeVisible(); await expect(page.getByText("成果を読み込んでいます…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "再取得", exact: true })).toBeEnabled();
    expect(await stored(page)).toEqual([]); expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(1);
    await evidence(page, fixture, testInfo, `${reason}-pending-list-explicit-recovery`);
    const delayed = page.waitForResponse(response => new URL(response.url()).pathname === "/api/dashboard/google-results" && response.request().method() === "GET");
    release(); await delayed;
    await expect(alert).toBeVisible();
    await page.getByRole("button", { name: "再取得", exact: true }).click(); await count(page, 1);
    await expect(alert).toHaveCount(0); await expect(line(page)).toBeEnabled();
    expect(await stored(page)).toEqual([]); expect(posts(fixture)).toHaveLength(1); expect(commits(fixture)).toHaveLength(1);
    await evidence(page, fixture, testInfo, `${reason}-pending-list-recovered-one`);
  });
}
