"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildSurveyPublicUrl } from "@/lib/survey-public-url";
import { challengeStatuses, missions, remainingChecks, statusLabels, type ChallengeDocument, type ChallengeStatus, type Evidence, type MissionProgress, type Snapshot, type WeeklyAction } from "@/lib/challenge";
import styles from "./page.module.css";

export type ChallengeView = {
  success: true; school: { id: string; name: string; phoneNumber: string | null; addressLine: string | null; websiteUrl: string | null };
  document: ChallengeDocument | null; version: number; snapshot: Snapshot; surveys: Array<{ id: string; title: string }> | null; actions: WeeklyAction[];
};
type Save = (command: Record<string, unknown>) => Promise<void>;
function scopedHref(path: string, schoolId: string) {
  return `${path}${path.includes("?") ? "&" : "?"}schoolId=${encodeURIComponent(schoolId)}`;
}
function display(value: number | null | undefined, unit = "件") {
  return value == null ? "未計測" : `${Math.round(value * 10) / 10}${unit}`;
}

function MissionForm({ progress, data, save, busy }: { progress: MissionProgress; data: ChallengeView; save: Save; busy: boolean }) {
  const mission = missions[progress.day - 1];
  const [evidence, setEvidence] = useState<Evidence>(progress.evidence);
  const [note, setNote] = useState(progress.note);
  const [status, setStatus] = useState<ChallengeStatus>(progress.status === "NOT_STARTED" ? "IN_PROGRESS" : progress.status);
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); void save({ action: "mission", day: mission.day, evidence, note, status }); }}>
    <h2>DAY{mission.day} {mission.title}</h2>
    <p>{mission.criterion}</p>
    <p className={styles.muted}>記録区分：手動申告 / 目安 {mission.minutes}分</p>
    {mission.day === 1 ? <div className={styles.facts}>
      <h3>優先確認項目（最大3件）</h3>
      <ul>{[{ label: "電話番号", value: data.school.phoneNumber }, { label: "住所", value: data.school.addressLine }, { label: "Webサイト", value: data.school.websiteUrl }].map(item => <li key={item.label}>{item.label}：{item.value || "DB未設定"}（Google上の内容は手動確認）</li>)}</ul>
    </div> : null}
    {mission.day === 4 ? <p>追加依頼目標：{data.document!.additionalTarget}名 / DB内の未対応口コミ：{display(data.snapshot.reviews?.pending)}</p> : null}
    {mission.day === 6 ? <div className={styles.facts}>{data.snapshot.comparisons?.length ? data.snapshot.comparisons.map(c => <div key={c.id}><h3>{c.keyword}</h3><p>計測：{c.at} / ID：{c.id}</p><ul>{c.competitors.map((row, i) => <li key={i}>{row.name} / 評価 {display(row.rating, "")} / 口コミ {display(row.reviewCount)}</li>)}</ul></div>) : <p>保存済み競合データがありません。順位計測・設定を確認してください。</p>}</div> : null}
    <div className={styles.links}>{mission.links.map(link => <Link key={link.path} href={scopedHref(link.path, data.school.id)}>{link.label} →</Link>)}</div>
    <fieldset disabled={busy}>
      {mission.fields.map(field => <label key={field.key}>{field.label}
        {field.type === "select" ? <select value={evidence[field.key] ?? ""} onChange={e => setEvidence(v => ({ ...v, [field.key]: e.target.value }))}>
          <option value="">未確認</option>{field.options!.map(option => <option key={option}>{option}</option>)}
        </select> : field.key === "comparisonId" ? <select value={evidence[field.key] ?? ""} onChange={e => setEvidence(v => ({ ...v, [field.key]: e.target.value }))}>
          <option value="">計測を選択</option>{data.snapshot.comparisons?.map(c => <option key={c.id} value={c.id}>{c.keyword} / {c.at}</option>)}
        </select> : <input type={field.type === "number" ? "number" : "text"} min={0} max={10000} maxLength={2000} value={evidence[field.key] ?? ""} onChange={e => setEvidence(v => ({ ...v, [field.key]: field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value }))} />}
      </label>)}
      <label>実行記録・残課題の理由<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <label>進捗状態<select value={status} onChange={e => setStatus(e.target.value as ChallengeStatus)}>{challengeStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
      <button type="submit">実行記録を保存</button>
    </fieldset>
    {progress.completedAt ? <p>完了記録：{progress.completedAt}</p> : null}
  </form>;
}
function InquiryForm({ doc, save, busy }: { doc: ChallengeDocument; save: Save; busy: boolean }) {
  const [values, setValues] = useState({ google: doc.inquiries?.google ?? "", unknown: doc.inquiries?.unknown ?? "", other: doc.inquiries?.other ?? "", tests: doc.inquiries?.tests ?? "" });
  return <form className={styles.form} onSubmit={e => { e.preventDefault(); void save({ action: "inquiries", ...values }); }}><h2>問い合わせ成果（手動申告）</h2>
    <p>開始日 {doc.startedAt.slice(0, 10)} からの累計。Google経由と確認できない実問い合わせは「流入元不明」に記録し、テストは実問い合わせ件数に含めません。</p>
    <fieldset disabled={busy}>{([["google", "Google経由の実問い合わせ"], ["unknown", "流入元不明の実問い合わせ"], ["other", "その他の実問い合わせ"], ["tests", "テスト問い合わせ（成果対象外）"]] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min={0} max={10000} required value={values[key]} onChange={e => setValues(v => ({ ...v, [key]: e.target.value === "" ? "" : Number(e.target.value) }))} /></label>)}<button>問い合わせ記録を保存</button></fieldset>
  </form>;
}
function WeeklyRecord({ action, data, save, busy }: { action: WeeklyAction; data: ChallengeView; save: Save; busy: boolean }) {
  const [note, setNote] = useState(data.document!.actions[action.key]?.note ?? "");
  const [status, setStatus] = useState(action.status === "COMPLETED" ? "COMPLETED" : "DEFERRED");
  return <article className={styles.card}><h2>{action.title}</h2><p>{action.reason}</p><span className={styles.badge}>{statusLabels[action.status as ChallengeStatus]}</span>
    <Link href={scopedHref(action.path, data.school.id)}>関連画面へ →</Link>
    {action.day ? null : <form onSubmit={e => { e.preventDefault(); void save({ action: "weekly", key: action.key, status, note }); }}><fieldset disabled={busy}>
      <label>対応記録<textarea value={note} maxLength={2000} required onChange={e => setNote(e.target.value)} /></label>
      <label>対応状態<select value={status} onChange={e => setStatus(e.target.value)}><option value="DEFERRED">後で対応</option><option value="COMPLETED">完了（手動申告）</option></select></label><button>対応を保存</button>
    </fieldset></form>}
  </article>;
}
export default function ChallengeClient({ weekly = false }: { weekly?: boolean }) {
  const params = useSearchParams();
  const schoolId = params.get("schoolId") || "";
  const day = Number(params.get("day")) || 0;
  const [state, setState] = useState<{ key: string; data: ChallengeView | null; error: string }>({ key: "", data: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [target, setTarget] = useState(10);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const epoch = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    const generation = ++epoch.current;
    saving.current = false; setBusy(false); setNotice("");
    setState({ key: schoolId, data: null, error: "" });
    async function load() {
      try {
        if (!schoolId || schoolId === "all") throw new Error("ヘッダーで対象の校舎を選択してください。");
        const { data } = await createBrowserSupabaseClient().auth.getSession();
        if (!data.session?.access_token) throw new Error("ログイン後に集客チャレンジを確認してください。");
        const response = await fetch(`/api/dashboard/challenge?schoolId=${encodeURIComponent(schoolId)}`, { headers: { authorization: `Bearer ${data.session.access_token}` }, signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok || body.success !== true) throw new Error(body.error || "集客チャレンジを取得できませんでした。");
        if (!controller.signal.aborted && epoch.current === generation) setState({ key: schoolId, data: body, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key: schoolId, data: null, error: error instanceof Error ? error.message : "取得に失敗しました。" });
      }
    }
    void load();
    return () => { controller.abort(); epoch.current++; };
  }, [schoolId, retry]);
  const current = state.key === schoolId ? state : null;
  const data = current?.data;
  async function save(command: Record<string, unknown>) {
    if (!data || saving.current) return;
    const generation = epoch.current;
    saving.current = true; setBusy(true); setNotice("");
    try {
      const { data: auth } = await createBrowserSupabaseClient().auth.getSession();
      if (!auth.session?.access_token) throw new Error("ログインし直してください。");
      if (generation !== epoch.current) return;
      const response = await fetch(`/api/dashboard/challenge?schoolId=${encodeURIComponent(schoolId)}`, { method: "POST", headers: { authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...command, version: data.version }) });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || "保存できませんでした。");
      if (generation === epoch.current) setRetry(v => v + 1);
    } catch (error) {
      if (generation === epoch.current) setNotice(error instanceof Error ? error.message : "保存できませんでした。");
    } finally {
      if (generation === epoch.current) { saving.current = false; setBusy(false); }
    }
  }
  async function copyRequest(survey: { id: string; title: string }) {
    try {
      const url = buildSurveyPublicUrl(window.location.origin, schoolId, survey.id);
      await navigator.clipboard.writeText(`${data!.school.name}をご利用いただきありがとうございます。実際のご体験について率直なお声をお聞かせください。回答・投稿は任意です。\n${url}`);
      setNotice("依頼文をコピーしました。送信後に実際の依頼人数を記録してください。");
    } catch { setNotice("コピーできませんでした。アンケート一覧でURLを確認してください。"); }
  }
  const doc = data?.document;
  const completed = doc?.missions.filter(m => m.status === "COMPLETED").length ?? 0;
  const recommended = doc?.missions.find(m => m.status !== "COMPLETED" && m.status !== "DEFERRED") ?? doc?.missions.find(m => m.status !== "COMPLETED");
  const selected = doc?.missions.find(m => m.day === day) ?? recommended;
  const href = (path: string) => scopedHref(path, schoolId);
  return <main className={styles.page}>
    <header><p className={styles.kicker}>集客チャレンジ</p><h1>{weekly ? "今週のアクション" : "7日間チャレンジ"}</h1><p>導入後7日以内に、Google経由の新規問い合わせ1件を目指す</p>{data ? <p>{data.school.name}</p> : null}</header>
    <nav className={styles.tabs}><Link aria-current={!weekly ? "page" : undefined} href={href("/dashboard/challenge")}>7日間チャレンジ</Link><Link aria-current={weekly ? "page" : undefined} href={href("/dashboard/challenge/weekly")}>今週のアクション</Link><button type="button" disabled={busy} onClick={() => setRetry(v => v + 1)}>再取得</button></nav>
    {current?.error ? <p role="alert" className={styles.error}>{current.error}</p> : !data ? <p role="status">集客チャレンジを読み込んでいます。</p> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {data ? <>
      {data.snapshot.errors.map(error => <p role="alert" className={styles.error} key={error}>{error}</p>)}
      <p className={styles.muted}>Google連携：{data.snapshot.google === null ? "取得失敗" : data.snapshot.google ? "設定済み" : "未連携"} / Instagram：{data.snapshot.instagram === null ? "取得失敗" : data.snapshot.instagram ? "設定済み" : "未連携"}</p>
      {data.snapshot.google === false ? <Link href={href("/dashboard/settings/google")}>Googleアカウントを連携する →</Link> : null}
      {!doc ? <form className={styles.form} onSubmit={e => { e.preventDefault(); void save({ action: "start", additionalTarget: target }); }}><h2>7つのミッションを始める</h2><p>同じ日に複数のミッションへ進めます。成果の件数と、行動の完了は別に記録します。</p><label>DAY4の追加依頼目標人数<input type="number" min={1} max={10000} required value={target} onChange={e => setTarget(Number(e.target.value))} disabled={busy} /></label><p>DAY3は10名、DAY4は別の{target}名へ依頼します。</p><button disabled={busy}>チャレンジを開始</button></form> : <>
        <section className={styles.progress}><h2>{completed} / 7 完了</h2><progress value={completed} max={7} /><p>開始：{doc.startedAt.slice(0, 10)} / 後日対応の残課題：{remainingChecks(doc).length}件</p>
          {completed === 7 ? <><h2>7つの実行記録がそろいました</h2><p>問い合わせの獲得を保証するものではありません。残課題は引き続き今週のアクションで確認できます。</p><Link href={href("/dashboard/challenge/weekly")}>今週のアクションへ →</Link></> : recommended ? <p>今日のおすすめ：<Link href={href(`/dashboard/challenge?day=${recommended.day}`)}>DAY{recommended.day} {missions[recommended.day - 1].title}</Link> / 約{missions[recommended.day - 1].minutes}分</p> : null}
        </section>
        {weekly ? <section className={styles.grid}>{data.actions.length ? data.actions.map(action => <WeeklyRecord key={`${data.version}-${action.key}`} action={action} data={data} save={save} busy={busy} />) : <p>現在、記録が必要なアクションはありません。</p>}</section> : <>
          <section className={styles.grid} aria-label="7つのミッション">{doc.missions.map(m => <article className={styles.card} key={m.day}><span>DAY{m.day}</span><h2>{missions[m.day - 1].title}</h2><span className={styles.badge}>{statusLabels[m.status]}</span><small>約{missions[m.day - 1].minutes}分</small><Link href={href(`/dashboard/challenge?day=${m.day}`)}>ミッションを開く →</Link></article>)}</section>
          {selected ? <MissionForm key={`${schoolId}-${data.version}-${selected.day}`} progress={selected} data={data} save={save} busy={busy} /> : null}
          {(selected?.day === 3 || selected?.day === 4) ? <section className={styles.form}><h2>口コミアンケートの依頼</h2>{data.surveys?.length ? data.surveys.map(s => <p key={s.id}>{s.title} <button type="button" onClick={() => void copyRequest(s)}>依頼文・URLをコピー</button></p>) : <p>有効なアンケートがありません。アンケート設定を確認してください。</p>}</section> : null}
        </>}
        <section className={styles.metrics}><h2>実行と成果</h2><p>計測期間：{doc.startedAt} ～ {data.snapshot.at}</p><p className={styles.muted}>口コミ・投稿はDB保存分。Googleの全件取得・公開を保証する集計ではありません。</p>
          <dl><dt>保存済みGoogle口コミ（開始 → 現在）</dt><dd>{display(doc.baseline.reviews?.count)} → {display(data.snapshot.reviews?.count)}</dd>
            <dt>平均評価（開始 → 現在）</dt><dd>{display(doc.baseline.reviews?.rating, "")} → {display(data.snapshot.reviews?.rating, "")}</dd>
            <dt>返信記録率（開始 → 現在）</dt><dd>{display(doc.baseline.reviews?.replyRate, "%")} → {display(data.snapshot.reviews?.replyRate, "%")}</dd>
            <dt>同期投稿数（開始 → 現在）</dt><dd>{display(doc.baseline.posts?.count)} → {display(data.snapshot.posts?.count)}</dd>
            <dt>期間内の新規口コミ（Google投稿日基準）</dt><dd>{display(data.snapshot.reviews?.newCount)}</dd>
            <dt>期間内のアンケート回答</dt><dd>{display(data.snapshot.surveyResponses)}</dd>
            <dt>依頼人数（手動申告）</dt><dd>DAY3：{display(doc.missions[2].evidence.requested === undefined ? null : Number(doc.missions[2].evidence.requested), "名")} / DAY4：{display(doc.missions[3].evidence.requested === undefined ? null : Number(doc.missions[3].evidence.requested), "名")}</dd>
            <dt>回答率・口コミ転換率</dt><dd>未計測（依頼と回答者の対応付けなし）</dd>
            <dt>Google経由の実問い合わせ（手動申告）</dt><dd>{display(doc.inquiries?.google)}</dd>
            <dt>写真・38項目診断スコア</dt><dd>未計測 / 写真カテゴリはDAY2の手動確認</dd></dl>
          {doc.after ? <p>完了時スナップショット保存：{doc.after.at} / 口コミ {display(doc.after.reviews?.count)} / 同期投稿 {display(doc.after.posts?.count)}</p> : null}
        </section>
        <InquiryForm key={`${schoolId}-${data.version}-inquiry`} doc={doc} save={save} busy={busy} />
      </>}
    </> : null}
  </main>;
}
