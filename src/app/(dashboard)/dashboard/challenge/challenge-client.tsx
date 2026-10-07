"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { buildSurveyPublicUrl } from "@/lib/survey-public-url";
import { challengeStatuses, missions, photoConfirmation, remainingChecks, statusLabels, type ChallengeDocument, type ChallengeStatus, type Evidence, type MissionProgress, type Snapshot, type WeeklyAction } from "@/lib/challenge";
import styles from "./page.module.css";
import { DayCards, DayDetail, DiagnosticDetails, OverallProgress } from "./day-detail";
import { ActionPanel, ChallengeGoal } from "./next-actions";
import { deriveJourney, fieldAnchor } from "@/lib/challenge-journey";
import { Journey } from "./journey";
import { guideForAction, guideForField } from "@/lib/action-guides";
import { ActionExecutionGuide } from "./action-guide";

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

function MissionForm({ progress, data, save, busy, notice, onPhotoDraft }: { progress: MissionProgress; data: ChallengeView; save: Save; busy: boolean; notice: string; onPhotoDraft: (evidence: Evidence, note: string) => void }) {
  const mission = missions[progress.day - 1];
  const [evidence, setEvidence] = useState<Evidence>(progress.evidence);
  const [note, setNote] = useState(progress.note);
  const [status, setStatus] = useState<ChallengeStatus>(progress.status === "NOT_STARTED" ? "IN_PROGRESS" : progress.status);
  const [editingPhoto, setEditingPhoto] = useState<string | null>(null);
  const photos = mission.day === 2 ? photoConfirmation(evidence, note) : null;
  useEffect(() => { if (mission.day === 2) onPhotoDraft(evidence, note); }, [evidence, note, mission.day, onPhotoDraft]);
  const dirty = note !== progress.note || mission.fields.some(field => evidence[field.key] !== progress.evidence[field.key]);
  function focusPhoto(key: string) {
    setEditingPhoto(key);
    const element = document.getElementById(fieldAnchor(2, key));
    element?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    element?.focus({ preventScroll: true });
  }
  return <form id="execution-record" className={styles.form} onSubmit={e => { e.preventDefault(); void save({ action: "mission", day: mission.day, evidence, note, status: photos?.status ?? status }); }}>
    <h3>{photos ? "写真カテゴリの確認" : "実行記録"}</h3>
    <p className={styles.muted}>記録区分：手動申告 / 目安 {mission.minutes}分</p>
    {photos ? <p className={dirty ? styles.unsaved : styles.muted} role="status">{dirty ? "未保存の変更があります。下の保存ボタンで8カテゴリをまとめて保存します。" : "保存済みの確認内容です。"}</p> : null}
    {mission.day === 1 ? <p>全項目に回答し、最優先・重要項目を「はい」または「修正済み」にすると完了できます。残課題の補足メモは任意です。</p> : null}
    {mission.day === 1 ? <details className={styles.details}><summary>登録済み基本情報を見る</summary><div className={styles.facts}>
      <h3>登録済み基本情報</h3>
      <ul>{[{ label: "電話番号", value: data.school.phoneNumber }, { label: "住所", value: data.school.addressLine }, { label: "Webサイト", value: data.school.websiteUrl }].map(item => <li key={item.label}>{item.label}：{item.value || "DB未設定"}（Google上の内容は手動確認）</li>)}</ul>
    </div></details> : null}
    {mission.day === 4 ? <p>追加依頼目標：{data.document!.additionalTarget}名 / DB内の未対応口コミ：{display(data.snapshot.reviews?.pending)}</p> : null}
    {mission.day === 3 ? <p>今回の依頼目標：{data.document!.requestTarget?.count ?? 10}名。0名の場合も実際の確認を行い、依頼人数0と確認内容を記録してください。</p> : null}
    {mission.day === 6 ? <div className={styles.facts}>{data.snapshot.comparisons?.length ? data.snapshot.comparisons.map(c => <div key={c.id}><h3>{c.keyword}</h3><p>計測：{c.at} / ID：{c.id}</p><ul>{c.competitors.map((row, i) => <li key={i}>{row.name} / 評価 {display(row.rating, "")} / 口コミ {display(row.reviewCount)}</li>)}</ul></div>) : <p>保存済み競合データがありません。順位計測・設定を確認してください。</p>}</div> : null}
    <div className={styles.links}>{mission.links.map(link => <Link key={link.path} href={scopedHref(link.path, data.school.id)}>{link.label} →</Link>)}</div>
    <fieldset disabled={busy}>
      {mission.fields.map(field => photos ? <section key={field.key} id={fieldAnchor(2, field.key)} tabIndex={-1} className={styles.photoRow} onFocus={e => { if (e.target === e.currentTarget) setEditingPhoto(field.key); }} aria-label={`${field.label}の写真`}>
        <div className={styles.photoSummary}><strong>{field.label}</strong><span className={styles.badge} data-state={photos.remaining.some(item => item.key === field.key) ? "WARNING" : "GOOD"}>{evidence[field.key] === "要改善" ? "要対応" : evidence[field.key] === "後で対応" ? "あとで確認" : evidence[field.key] || "未確認"}{evidence[field.key] !== progress.evidence[field.key] ? "（未保存）" : ""}</span><button type="button" aria-expanded={editingPhoto === field.key} aria-controls={`photo-editor-${field.key}`} aria-label={`${field.label}を${evidence[field.key] ? "変更" : "確認する"}`} onClick={() => setEditingPhoto(editingPhoto === field.key ? null : field.key)}>{evidence[field.key] ? "変更" : "確認する"}</button></div>
        {editingPhoto === field.key ? <div id={`photo-editor-${field.key}`} className={styles.photoEditor}><ActionExecutionGuide guide={guideForField(2, field.key)} schoolId={data.school.id} /><fieldset className={styles.selfCheck} role="radiogroup" aria-label={field.label}><legend>{field.question}</legend><div>{field.options!.map(option => <label key={option}><input type="radio" name={field.key} value={option} checked={evidence[field.key] === option} onChange={() => setEvidence(v => ({ ...v, [field.key]: option }))} />{option === "要改善" ? "いいえ" : option === "後で対応" ? "あとで確認" : option}</label>)}</div>
          {evidence[field.key] === "対象外" ? <label>対象外の理由（{photos.exempt.map(item => item.label).join("・")}）<textarea aria-label={`対象外の理由（${photos.exempt.map(item => item.label).join("・")}）`} maxLength={2000} value={note} placeholder="例：専用駐車場がないため" onChange={e => setNote(e.target.value)} /><small>対象外カテゴリ共通の記録です。</small></label> : null}
        </fieldset><button type="button" onClick={() => setEditingPhoto(null)}>一覧に戻る</button></div> : null}
      </section> : field.question ? <fieldset id={fieldAnchor(mission.day, field.key)} tabIndex={-1} className={styles.selfCheck} key={field.key} role="radiogroup" aria-label={field.label}><legend>{field.label}</legend><p>{field.question}</p><div>{field.options!.map(option => <label key={option}><input type="radio" name={field.key} value={option} checked={evidence[field.key] === option} onChange={() => setEvidence(v => ({ ...v, [field.key]: option }))} />{option === "確認済み" || option === "実施済み" ? "はい" : option === "要改善" ? "いいえ" : option === "後で対応" ? "あとで確認" : option}</label>)}</div></fieldset> : <label id={fieldAnchor(mission.day, field.key)} tabIndex={-1} key={field.key}>{field.label}
        {field.type === "select" ? <select aria-label={field.label} value={evidence[field.key] ?? ""} onChange={e => setEvidence(v => ({ ...v, [field.key]: e.target.value }))}>
          <option value="">未確認</option>{field.options!.map(option => <option key={option}>{option}</option>)}
        </select> : field.key === "comparisonId" ? <select value={evidence[field.key] ?? ""} onChange={e => setEvidence(v => ({ ...v, [field.key]: e.target.value }))}>
          <option value="">計測を選択</option>{data.snapshot.comparisons?.map(c => <option key={c.id} value={c.id}>{c.keyword} / {c.at}</option>)}
        </select> : <input type={field.type === "number" ? "number" : "text"} min={0} max={10000} maxLength={2000} value={evidence[field.key] ?? ""} onChange={e => setEvidence(v => ({ ...v, [field.key]: field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value }))} />}
      </label>)}
      {!photos?.exempt.length ? <details className={styles.details}><summary>{note ? "メモを確認・編集" : "メモを追加する（任意）"}</summary><label>{photos ? "確認メモ（任意）" : "実行記録・残課題の理由"}<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><small>空欄のまま保存できます。</small></details> : null}
      {!photos ? <label id={fieldAnchor(mission.day, "status")} tabIndex={-1}>進捗状態<select value={status} onChange={e => setStatus(e.target.value as ChallengeStatus)}>{challengeStatuses.map(s => <option key={s} value={s}>{statusLabels[s]}</option>)}</select></label> : null}
      <section id={photos ? fieldAnchor(2, "status") : undefined} tabIndex={-1} className={styles.completion} aria-label={`DAY${mission.day}の完了条件`}>
        <h3>DAY{mission.day} 完了準備</h3>
        {photos ? <><strong>{8 - photos.remaining.length} / 8 項目確認済み</strong><h4>{photos.remaining.length ? `DAY2完了まであと${photos.remaining.length}カテゴリ` : "DAY2完了条件を満たしました。"}</h4>
          {photos.remaining.length ? <><ul>{photos.remaining.map(item => <li key={item.key}>{item.label}：{item.reason}</li>)}</ul><button type="button" onClick={() => focusPhoto(photos.remaining.find(item => !item.deferred)?.key ?? photos.remaining[0].key)}>最初の未完了項目へ移動</button></> : <p>{progress.status === "COMPLETED" ? "DAY2は完了済みです。確認内容を変更した場合は再度保存してください。" : "確認内容を保存するとDAY2 CLEARになります。"}</p>}
          <p className={styles.muted}>追加済み・既存写真で充足はメモ不要です。対象外の場合だけ理由を記録してください。</p></> : <p>確認内容と進捗状態を保存します。</p>}
        <button className={styles.primary} type="submit">{photos ? photos.status === "COMPLETED" ? "DAY2を完了する" : "確認内容を保存" : "実行記録を保存"}</button>
      </section>
    </fieldset>
    {photos && progress.status !== "COMPLETED" ? <div className={styles.stickyAction} aria-label="DAY2の操作"><span>DAY2 <strong>{8 - photos.remaining.length} / 8確認済み</strong>{dirty ? <small>未保存</small> : null}</span><button disabled={busy} type="button" className={styles.primary} onClick={() => focusPhoto(photos.remaining.find(item => !item.deferred)?.key ?? photos.remaining[0]?.key ?? "status")}>{photos.remaining.length ? "未完了項目へ移動" : "DAY2を完了する"}</button></div> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
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
    <ActionExecutionGuide guide={guideForAction(action.key)} schoolId={data.school.id} snapshot={data.snapshot} />
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
  const [savedDay, setSavedDay] = useState<{ schoolId: string; day: number } | null>(null);
  const [taskTarget, setTaskTarget] = useState<{ schoolId: string; day: number; key: string; urlDay: number } | null>(null);
  const [photoDraft, setPhotoDraft] = useState<{ schoolId: string; version: number; evidence: Evidence; note: string } | null>(null);
  const epoch = useRef(0);
  const saving = useRef(false);
  useEffect(() => { setTaskTarget(null); }, [schoolId, day]);
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
  const onPhotoDraft = useCallback((evidence: Evidence, note: string) => setPhotoDraft({ schoolId, version: data!.version, evidence, note }), [schoolId, data]);
  async function save(command: Record<string, unknown>) {
    if (!data || saving.current) return;
    const generation = epoch.current;
    saving.current = true; setBusy(true); setNotice("");
    let persisted = false;
    try {
      const { data: auth } = await createBrowserSupabaseClient().auth.getSession();
      if (!auth.session?.access_token) throw new Error("ログインし直してください。");
      if (generation !== epoch.current) return;
      const response = await fetch(`/api/dashboard/challenge?schoolId=${encodeURIComponent(schoolId)}`, { method: "POST", headers: { authorization: `Bearer ${auth.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...command, version: data.version }) });
      const body = await response.json();
      if (!response.ok || body.success !== true) throw new Error(body.error || "保存できませんでした。");
      persisted = true;
      if (generation !== epoch.current) return;
      const refreshed = await fetch(`/api/dashboard/challenge?schoolId=${encodeURIComponent(schoolId)}`, { headers: { authorization: `Bearer ${auth.session.access_token}` }, cache: "no-store" });
      const latest = await refreshed.json();
      if (!refreshed.ok || latest.success !== true) throw new Error("保存後の再取得に失敗しました。");
      if (generation === epoch.current) {
        if (command.action === "mission") setSavedDay({ schoolId, day: Number(command.day) });
        setState({ key: schoolId, data: latest, error: "" });
        setNotice(command.action === "mission" && command.day === 2 ? "写真の確認内容を保存しました。" : "実行記録を保存しました。");
      }
    } catch (error) {
      if (generation === epoch.current) setNotice(persisted ? "保存は完了しましたが、最新状態を取得できませんでした。「最新データに更新」で確認してください。" : error instanceof Error ? error.message : "保存できませんでした。");
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
  const activeTarget = taskTarget?.schoolId === schoolId && taskTarget.urlDay === day ? taskTarget : null;
  const journey = doc && data ? deriveJourney(doc, data.snapshot, activeTarget?.day || day || (savedDay?.schoolId === schoolId ? savedDay.day : 0)) : null;
  const selected = journey?.viewingDay;
  const journeyDoc = doc && selected?.day === 2 && photoDraft?.schoolId === schoolId && photoDraft.version === data?.version
    ? { ...doc, missions: doc.missions.map(m => m.day === 2 ? { ...m, evidence: photoDraft.evidence, note: photoDraft.note } : m) } : doc;
  useEffect(() => {
    if (!activeTarget) return;
    const element = document.getElementById(fieldAnchor(activeTarget.day, activeTarget.key));
    if (!element) return;
    element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    element.focus({ preventScroll: true });
    element.classList.add(styles.taskHighlight);
    const timer = window.setTimeout(() => element.classList.remove(styles.taskHighlight), 2500);
    return () => { window.clearTimeout(timer); element.classList.remove(styles.taskHighlight); };
  }, [activeTarget]);
  const href = (path: string) => scopedHref(path, schoolId);
  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>{weekly ? "今週のアクション" : "7日間チャレンジ"}</h1>{data ? <small>{data.school.name}</small> : null}</header>
    <nav className={styles.tabs}><Link aria-current={!weekly ? "page" : undefined} href={href("/dashboard/challenge")}>7日間チャレンジ</Link><Link aria-current={weekly ? "page" : undefined} href={href("/dashboard/challenge/weekly")}>今週のアクション</Link><button type="button" disabled={busy} onClick={() => setRetry(v => v + 1)}>最新データに更新</button></nav>
    {current?.error ? <p role="alert" className={styles.error}>{current.error}</p> : !data ? <p className={styles.loading} role="status">今日やることを確認しています…</p> : null}
    {notice && (weekly || !selected) ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {data ? <>
      {!weekly && journeyDoc ? <Journey doc={journeyDoc} snapshot={data.snapshot} viewingDay={selected?.day ?? 0} schoolId={schoolId} onTask={(targetDay, key) => setTaskTarget({ schoolId, day: targetDay, key, urlDay: day })} /> : null}
      {!doc ? <><form id="challenge-start" className={styles.form} onSubmit={e => { e.preventDefault(); void save({ action: "start", additionalTarget: target }); }}><h2>7つのミッションを始める</h2><p>同じ日に複数のミッションへ進めます。成果の件数と、行動の完了は別に記録します。</p><label>DAY4の追加依頼目標人数<input type="number" min={1} max={10000} required value={target} onChange={e => setTarget(Number(e.target.value))} disabled={busy} /></label><p>DAY3は10名、DAY4は別の{target}名へ依頼します。</p><button disabled={busy}>チャレンジを開始</button></form><DayCards doc={null} snapshot={data.snapshot} schoolId={schoolId} /></> : <>
        {weekly ? <><ChallengeGoal doc={doc} snapshot={data.snapshot} /><ActionPanel doc={doc} snapshot={data.snapshot} schoolId={schoolId} day={day || undefined} weekly save={save} busy={busy} /></> : null}
        {weekly ? <section className={styles.grid}>{data.actions.length ? data.actions.map(action => <WeeklyRecord key={`${data.version}-${action.key}`} action={action} data={data} save={save} busy={busy} />) : <p>現在、記録が必要なアクションはありません。</p>}</section> : <>
          {selected && selected.status !== "COMPLETED" && journey?.currentDay && selected.day !== journey.currentDay.day ? <p className={styles.viewing}>DAY{selected.day}を閲覧しています。現在取り組むDAYはDAY{journey.currentDay.day}です。<Link href={href(`/dashboard/challenge?day=${journey.currentDay.day}`)}>現在のDAYに戻る →</Link></p> : null}
          {selected ? <DayDetail compact actionsProvided day={selected.day} doc={doc} snapshot={data.snapshot} schoolId={schoolId}><MissionForm key={`${schoolId}-${data.version}-${selected.day}`} progress={selected} data={data} save={save} busy={busy} notice={notice} onPhotoDraft={onPhotoDraft} /></DayDetail> : null}
          {(selected?.day === 3 || selected?.day === 4) ? <section className={styles.form}><h2>口コミアンケートの依頼</h2>{data.surveys?.length ? data.surveys.map(s => <p key={s.id}>{s.title} <button type="button" onClick={() => void copyRequest(s)}>依頼文・URLをコピー</button></p>) : <p>有効なアンケートがありません。アンケート設定を確認してください。</p>}</section> : null}
        </>}
        <p><Link href={href("/dashboard/roi")}>Google集客成果を見る →</Link></p>
        <details key={`overview-${day}-${weekly}`} open={weekly} className={styles.details}><summary>全体・DAY別の進捗一覧</summary>{weekly ? <OverallProgress doc={doc} snapshot={data.snapshot} schoolId={schoolId} /> : <p>7つのDAYのうち{completed}つ完了</p>}
        <section className={styles.progress}><p>開始：{doc.startedAt.slice(0, 10)} / 要改善・後日対応の残項目：{remainingChecks(doc).length}件</p>
          {completed === 7 ? <><h2>7つの実行記録がそろいました</h2><p>問い合わせの獲得を保証するものではありません。残課題は引き続き今週のアクションで確認できます。</p><Link href={href("/dashboard/challenge/weekly")}>今週のアクションへ →</Link></> : null}
        </section>
        {!weekly ? <DayCards compact doc={doc} snapshot={data.snapshot} schoolId={schoolId} /> : null}</details>
        <details className={styles.details}><summary>実行と成果・問い合わせ記録</summary>{!weekly ? <ChallengeGoal doc={doc} snapshot={data.snapshot} /> : null}<section className={styles.metrics}><h2>実行と成果</h2><p>計測期間：{doc.startedAt} ～ {data.snapshot.at}</p><p className={styles.muted}>口コミ・投稿はDB保存分。Googleの全件取得・公開を保証する集計ではありません。</p>
          <dl><dt>保存済みGoogle口コミ（開始 → 現在）</dt><dd>{display(doc.baseline.reviews?.count)} → {display(data.snapshot.reviews?.count)}</dd>
            <dt>平均評価（開始 → 現在）</dt><dd>{display(doc.baseline.reviews?.rating, "")} → {display(data.snapshot.reviews?.rating, "")}</dd>
            <dt>返信記録率（開始 → 現在）</dt><dd>{display(doc.baseline.reviews?.replyRate, "%")} → {display(data.snapshot.reviews?.replyRate, "%")}</dd>
            <dt>同期投稿数（開始 → 現在）</dt><dd>{display(doc.baseline.posts?.count)} → {display(data.snapshot.posts?.count)}</dd>
            <dt>期間内の新規口コミ（Google投稿日基準）</dt><dd>{display(data.snapshot.reviews?.newCount)}</dd>
            <dt>期間内のアンケート回答</dt><dd>{display(data.snapshot.surveyResponses)}</dd>
            <dt>依頼人数（手動申告）</dt><dd>DAY3：{display(doc.missions[2].evidence.requested === undefined ? null : Number(doc.missions[2].evidence.requested), "名")} / DAY4：{display(doc.missions[3].evidence.requested === undefined ? null : Number(doc.missions[3].evidence.requested), "名")}</dd>
            <dt>回答率・口コミ転換率</dt><dd>未計測（依頼と回答者の対応付けなし）</dd>
            <dt>Google経由の実問い合わせ（手動申告）</dt><dd>{display(doc.inquiries?.google)}</dd>
            <dt>写真・診断スコア</dt><dd>未計測 / 写真カテゴリはDAY2の手動確認</dd></dl>
          {doc.after ? <p>完了時スナップショット保存：{doc.after.at} / 口コミ {display(doc.after.reviews?.count)} / 同期投稿 {display(doc.after.posts?.count)}</p> : null}
        </section>
        <InquiryForm key={`${schoolId}-${data.version}-inquiry`} doc={doc} save={save} busy={busy} />
        </details>
      </>}
      {data.snapshot.errors.length ? <details className={styles.warning}><summary>一部データ未取得（{data.snapshot.errors.length}件）</summary><ul>{data.snapshot.errors.map(error => <li key={error}>{error}</li>)}</ul><p>利用できるDAYは引き続き実行できます。「最新データに更新」で再確認してください。</p></details> : null}
      <details className={styles.details}><summary>連携・データ取得情報</summary>
      <p className={styles.muted}>最終取得：{data.snapshot.at} / 再取得対象：DB内の進捗・連携設定・口コミ・投稿・競合計測</p>
      <p className={styles.muted}>Google連携：{data.snapshot.google === null ? "取得失敗" : data.snapshot.google ? "設定済み" : "未連携"} / Instagram：{data.snapshot.instagram === null ? "取得失敗" : data.snapshot.instagram ? "設定済み" : "未連携"}</p>
      {data.snapshot.google === false ? <Link href={href("/dashboard/settings/google")}>Googleアカウントを連携する →</Link> : null}
      {data.snapshot.instagram === false ? <Link className={styles.connectionLink} href={href("/dashboard/settings/instagram")}>Instagramを連携する →</Link> : null}
      </details>
      {doc && !weekly ? <DiagnosticDetails doc={doc} /> : null}
    </> : null}
  </main>;
}
