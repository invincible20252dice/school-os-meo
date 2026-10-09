"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { leadChannels, leadGrades, leadStatuses, type LeadChannel, type LeadGrade, type LeadStatus } from "@/lib/google-leads";
import type { loadGoogleLeads } from "@/lib/google-lead-store";
import type { loadPerformance } from "@/lib/google-performance";
import styles from "./page.module.css";

type RecordRow = { id: string; channel: LeadChannel; grade: LeadGrade | null; status: LeadStatus; occurredAt: string; version: number };
type Results = Omit<Awaited<ReturnType<typeof loadGoogleLeads>>, "recent"> & { school: { id: string; name: string }; recent: RecordRow[] };
type Performance = Awaited<ReturnType<typeof loadPerformance>>;
const periods = { month: "今月", previous: "先月", six: "過去6ヶ月" };
const dateText = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const localDate = (value: string) => new Date(new Date(value).getTime() + 9 * 3600_000).toISOString().slice(0, 16);

async function api(url: string, method: string, body?: unknown, signal?: AbortSignal) {
  const { data } = await createBrowserSupabaseClient().auth.getSession();
  if (!data.session) throw new Error("ログイン後にGoogle集客成果を確認してください。");
  signal?.throwIfAborted();
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "取得・保存できませんでした。再取得してください。");
  return result;
}

export default function GoogleResultsClient() {
  const schoolId = useSearchParams().get("schoolId") || "";
  const [period, setPeriod] = useState<keyof typeof periods>("month"), [retry, setRetry] = useState(0);
  const key = `${schoolId}:${period}`;
  const [state, setState] = useState<{ key: string; data: Results | null; error: string }>({ key: "", data: null, error: "" });
  const [performance, setPerformance] = useState<{ key: string; data: Performance | null; error: boolean }>({ key: "", data: null, error: false });
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [created, setCreated] = useState<RecordRow | null>(null), [editing, setEditing] = useState<RecordRow | null>(null), [deleting, setDeleting] = useState<RecordRow | null>(null);
  const epoch = useRef(0), saving = useRef(false), controller = useRef<AbortController | null>(null);
  const pending = useRef<{ schoolId: string; channel: string; id: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const endpoint = `/api/dashboard/google-results?schoolId=${encodeURIComponent(schoolId)}&period=${period}`;

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const generation = ++epoch.current;
    saving.current = false; setBusy(false); setNotice(""); setCreated(null); setEditing(null); setDeleting(null);
    setState({ key, data: null, error: "" }); setPerformance({ key, data: null, error: false });
    if (!schoolId || schoolId === "all") {
      setState({ key, data: null, error: "ヘッダーで対象の校舎を選択してください。" });
      return () => abort.abort();
    }
    const active = () => !abort.signal.aborted && epoch.current === generation;
    void api(endpoint, "GET", undefined, abort.signal).then(data => { if (active()) setState({ key, data, error: "" }); }).catch(error => { if (active()) setState({ key, data: null, error: error.message }); });
    void api(endpoint.replace("google-results?", "google-results/performance?"), "GET", undefined, abort.signal).then(result => { if (active()) setPerformance({ key, data: result.data, error: false }); }).catch(() => { if (active()) setPerformance({ key, data: null, error: true }); });
    return () => abort.abort();
  }, [schoolId, period, retry, key, endpoint]);

  useEffect(() => {
    if (editing || deleting) { if (!dialog.current?.open) dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [editing, deleting]);

  const data = state.key === key ? state.data : null;
  const metrics = performance.key === key ? performance.data : null;
  async function mutate(method: string, body: Record<string, unknown>, message: string) {
    if (saving.current || !data) return;
    const generation = epoch.current, signal = controller.current!.signal;
    saving.current = true; setBusy(true); setNotice("");
    let persisted = false;
    try {
      const result = await api(endpoint, method, body, signal);
      persisted = true;
      if (signal.aborted || epoch.current !== generation) return;
      // The saved mutation makes the previous counts and record versions obsolete.
      // Keep writes unavailable until the authoritative read succeeds.
      setState({ key, data: null, error: "" });
      if (method === "POST") { pending.current = null; setCreated(result.lead); }
      else { setCreated(null); setEditing(null); setDeleting(null); }
      const latest = await api(endpoint, "GET", undefined, signal);
      if (!signal.aborted && epoch.current === generation) { setState({ key, data: latest, error: "" }); setNotice(message); }
    } catch (error) {
      if (!signal.aborted && epoch.current === generation) {
        if (persisted) setState({ key, data: null, error: "保存済みですが一覧を再取得できませんでした。再取得してください。" });
        else setNotice(error instanceof Error ? error.message : "保存できませんでした。再試行してください。");
      }
    } finally {
      if (epoch.current === generation) { saving.current = false; setBusy(false); }
    }
  }
  function add(channel: LeadChannel) {
    if (saving.current) return;
    if (pending.current?.schoolId !== schoolId || pending.current.channel !== channel) pending.current = { schoolId, channel, id: crypto.randomUUID() };
    void mutate("POST", { channel, idempotencyKey: pending.current.id }, `${leadChannels[channel]}経由の問い合わせを1件記録しました。`);
  }
  const update = (row: RecordRow, fields: Record<string, unknown>) => void mutate("PATCH", { id: row.id, version: row.version, ...fields }, "問い合わせ記録を更新しました。");
  const closeDialog = () => { if (!busy) { setEditing(null); setDeleting(null); } };

  return <main className={styles.page}>
    <header className={styles.header}><div><h1>Google集客成果</h1><p>{data?.school.name || "校舎別の成果"}</p></div><div className={styles.controls}><select aria-label="集計期間" value={period} onChange={e => setPeriod(e.target.value as keyof typeof periods)} disabled={busy}>{Object.entries(periods).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => setRetry(n => n + 1)} disabled={busy}>再取得</button></div></header>
    {state.key === key && state.error ? <p role="alert" className={styles.error}>{state.error}</p> : !data ? <p role="status">成果を読み込んでいます…</p> : null}
    {data ? <>
      <section className={styles.kpis} aria-label="実際の成果">
        <div className={styles.primary}><h2>{periods[period]}のGoogle経由面談</h2><strong>{data.meetingsCount}<small>件</small></strong><p>前月 {data.previousMeetings}件 → 今月 {data.currentMeetings}件 <b>{data.meetingDiff > 0 ? "+" : ""}{data.meetingDiff}件</b></p></div>
        <div><h2>Google経由問い合わせ</h2><strong>{data.inquiriesCount}<small>件</small></strong><p>面談化率 <b>{data.meetingRate === null ? "—" : `${data.meetingRate}%`}</b></p><p className={styles.caption}>期間内の問い合わせ {data.inquiriesCount}件のうち、現在面談 {data.convertedCount}件</p></div>
      </section>
      <section className={styles.section}><h2>Google経由問い合わせを記録</h2><p className={styles.caption}>Google検索・Googleマップ経由と確認できた問い合わせ</p>
        <div className={styles.addButtons}>{(["line", "phone", "web"] as const).map(channel => <button key={channel} disabled={busy} onClick={() => add(channel)}>{leadChannels[channel]} +1</button>)}</div>
        <p role="status" className={styles.notice}>{busy ? "保存しています…" : notice}</p>
        {created ? <div className={styles.optional}><span>学年を追加しますか？（任意）</span><div className={styles.controls}>{Object.entries(leadGrades).map(([grade, label]) => <button key={grade} disabled={busy} onClick={() => update(created, { grade })}>{label}</button>)}<button disabled={busy} onClick={() => setCreated(null)}>あとで</button></div></div> : null}
      </section>
      <section className={styles.section}><h2>Google上の行動 <small>Google API</small></h2><div className={styles.metrics}><div>Webサイトクリック<strong>{metrics?.websiteClicks === null || !metrics ? "未取得" : `${metrics.websiteClicks}件`}</strong></div><div>電話クリック<strong>{metrics?.phoneClicks === null || !metrics ? "未取得" : `${metrics.phoneClicks}件`}</strong></div></div>
        {metrics?.state === "disconnected" ? <p>Google未連携です。<Link href={`/dashboard/settings/google?schoolId=${encodeURIComponent(schoolId)}`}>Google連携を確認</Link></p> : performance.error || metrics?.state === "error" || metrics?.state === "stale" ? <p className={styles.warning}>Google指標を更新できませんでした。問い合わせの記録は利用できます。{metrics?.state === "stale" ? "前回取得した値を表示しています。" : ""}</p> : !metrics ? <p>Google指標を確認しています…</p> : metrics.state === "unavailable" ? <p>対象期間のGoogle指標は未取得です。</p> : null}
        {metrics?.updatedAt ? <p className={styles.caption}>{metrics.from}〜{metrics.to}（取得済み {metrics.measuredDays}日分）・最終更新 {dateText(metrics.updatedAt)}</p> : null}<p className={styles.caption}>クリック数と、手動記録された問い合わせ・面談数は別の指標です。</p>
      </section>
      <section className={styles.section}><h2>最近のGoogle経由問い合わせ <small>{periods[period]}・最新20件</small></h2>
        {!data.recent.length ? <p>まだGoogle経由の問い合わせ記録がありません。問い合わせが来たら、上の +1 ボタンから記録してください。</p> : <ul className={styles.list}>{data.recent.map(row => <li key={row.id}>
          <div><time dateTime={row.occurredAt}>{dateText(row.occurredAt)}</time><p>{row.grade ? leadGrades[row.grade] : "学年未設定"} ｜ {leadChannels[row.channel]}</p></div>
          <span className={row.status === "meeting" ? styles.meeting : styles.status}>{leadStatuses[row.status]}</span>
          <div className={styles.rowActions}>
            {row.status === "inquiry" ? <button disabled={busy} onClick={() => update(row, { status: "meeting" })}>面談になった</button> : null}
            <details onClick={event => { if (event.target instanceof HTMLButtonElement) event.currentTarget.open = false; }}>
              <summary aria-label={`${dateText(row.occurredAt)}の操作`} title="記録の操作">⋯</summary>
              <div className={styles.menu}>
                <button disabled={busy} onClick={() => setEditing(row)}>編集</button>
                <button disabled={busy || row.status === "lost"} onClick={() => update(row, { status: "lost" })}>見送り</button>
                <button disabled={busy} onClick={() => setDeleting(row)}>削除</button>
              </div>
            </details>
          </div>
        </li>)}</ul>}
      </section>
      <section className={styles.section}><h2>月次推移 <small>手動記録・直近6ヶ月</small></h2><table className={styles.table}><thead><tr><th>月</th><th>問い合わせ</th><th>面談</th></tr></thead><tbody>{data.monthlyTrend.map(row => <tr key={row.month}><th>{row.month}</th><td>{row.inquiries}件</td><td>{row.meetings}件</td></tr>)}</tbody></table><p className={styles.caption}>日本時間。問い合わせは発生日、面談は面談に更新した日で集計。0件は未記録を含みます。</p><p className={styles.caption}>{data.channelBreakdown.map(row => `${row.label} ${row.count}件`).join(" / ")}</p></section>
    </> : null}
    <dialog ref={dialog} className={styles.dialog} aria-label={deleting ? "問い合わせの削除" : "問い合わせの編集"} onCancel={event => { event.preventDefault(); closeDialog(); }}>
      {deleting ? <><h2>この問い合わせ記録を削除しますか？</h2><p>誤登録の記録を集計から除外します。実際に問い合わせがあった場合は「見送り」を選択してください。</p><div className={styles.controls}><button disabled={busy} onClick={closeDialog}>キャンセル</button><button disabled={busy} onClick={() => void mutate("DELETE", { id: deleting.id, version: deleting.version }, "問い合わせ記録を削除しました。")}>削除する</button></div></> : editing ? <form onSubmit={event => { event.preventDefault(); update(editing, { channel: editing.channel, grade: editing.grade, status: editing.status, occurredAt: editing.occurredAt }); }}>
        <h2>問い合わせの編集</h2><label>経路<select value={editing.channel} onChange={e => setEditing({ ...editing, channel: e.target.value as LeadChannel })}>{Object.entries(leadChannels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>学年<select value={editing.grade || ""} onChange={e => setEditing({ ...editing, grade: e.target.value as LeadGrade || null })}><option value="">未設定</option>{Object.entries(leadGrades).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>問い合わせ日時（日本時間）<input required type="datetime-local" value={localDate(editing.occurredAt)} onChange={e => { if (e.target.value) setEditing({ ...editing, occurredAt: `${e.target.value}:00+09:00` }); }} /></label>
        <label>状態<select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value as LeadStatus })}>{Object.entries(leadStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div className={styles.controls}><button type="button" disabled={busy} onClick={closeDialog}>キャンセル</button><button disabled={busy}>保存</button></div>
      </form> : null}
      {notice && (editing || deleting) ? <p role="status">{notice}</p> : null}
    </dialog>
  </main>;
}
