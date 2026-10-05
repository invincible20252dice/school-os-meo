"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { guideRegistry, postTopics, type ActionGuide, type GuideImage } from "@/lib/action-guides";
import type { Snapshot } from "@/lib/challenge";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./action-guide.module.css";

function ExampleImage({ image }: { image: GuideImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <figure><figcaption>{image.kind === "GOOD" ? "おすすめ例" : "避けたい例"}</figcaption><Image src={image.src} alt={image.alt} width={960} height={720} sizes="(max-width: 600px) 90vw, 480px" onError={() => setFailed(true)} /><small>撮影イメージ（AI生成）</small></figure>;
}
function DraftEditor({ guide, schoolId, snapshot }: { guide: ActionGuide; schoolId: string; snapshot?: Snapshot }) {
  const [facts, setFacts] = useState("");
  const [theme, setTheme] = useState(guide.title);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const topics = snapshot && guide.generation === "post" ? postTopics(snapshot) : null;
  async function generate() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setMessage("");
    try {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      if (!data.session?.access_token) throw new Error("ログインしてください。");
      const response = await fetch(`/api/dashboard/challenge/guide-draft?schoolId=${encodeURIComponent(schoolId)}`, { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ purpose: guide.generation, facts, theme }) });
      const body = await response.json();
      if (!response.ok || body.success !== true || typeof body.draft !== "string") throw new Error(body.error || "文章生成に失敗しました。");
      if (!controller.signal.aborted) { setDraft(body.draft); setMessage("下書きを生成しました。事実と照合し、編集してから使用してください。まだ公開されていません。"); }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "文章生成に失敗しました。"); }
    finally { if (!controller.signal.aborted) { setBusy(false); request.current = null; } }
  }
  return <section className={styles.draft} aria-label="自校舎用のAI下書き">
    {topics ? <><p>{topics.message}</p>{topics.topics.map(row => <button type="button" key={row.query} disabled={busy} onClick={() => setTheme(`${row.query}について、実際の教室の取り組みを紹介`)}>{row.query} / {row.month}・表示{row.impressions}回：このテーマを使う</button>)}</> : null}
    <label>文章のテーマ<input value={theme} maxLength={2000} disabled={busy} onChange={e => setTheme(e.target.value)} /></label>
    <label>確認済みの教室情報<textarea value={facts} maxLength={2000} disabled={busy} placeholder="対象学年、実際の指導内容、利用条件など。存在しないサービスは入力しないでください。" onChange={e => setFacts(e.target.value)} /></label>
    <button type="button" disabled={busy || !facts.trim() || !theme.trim()} onClick={() => void generate()}>{busy ? "下書きを生成中…" : "AIで自校舎用に作る"}</button>
    {draft ? <><label>AI下書き（編集・事実確認後に使用）<textarea value={draft} maxLength={4000} onChange={e => setDraft(e.target.value)} /></label><CopyText text={draft} label="確認した下書きをコピー" /></> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
function CopyText({ text, label }: { text: string; label: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setMessage("コピーしました。送信・公開・完了記録はまだ行っていません。"); }
    catch { setMessage("コピーできませんでした。本文を選択してコピーしてください。"); }
  }
  return <><button type="button" onClick={() => void copy()}>{label}</button>{message ? <p role="status">{message}</p> : null}</>;
}
export function ActionExecutionGuide({ guide, schoolId, snapshot, onExecute }: { guide?: ActionGuide; schoolId: string; snapshot?: Snapshot; onExecute?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!guide) return null;
  return <details className={styles.guide} onToggle={e => { if (e.currentTarget.open) setOpen(true); }}>
    <summary>やり方・お手本を見る<span className={styles.title}>{guide.title}</span></summary>
    {open ? <div className={styles.body} key={`${schoolId}-${guide.id}`}>
      <p>{guide.purpose}</p>
      {guide.images?.length ? <><div className={styles.images}>{guide.images.map(image => <ExampleImage key={image.src} image={image} />)}</div><p className={styles.caution}>このAI画像は撮影のお手本です。Googleへ投稿せず、同じような構図で実際の教室を撮影してください。</p></> : null}
      <h4>やること</h4><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
      {guide.example ? <div className={styles.comparison}><div><h4>改善前の例</h4><p>{guide.example.before}</p></div><div><h4>改善例（記入項目は要確認）</h4><p>{guide.example.after}</p></div></div> : null}
      {guide.sample ? <><h4>依頼例文</h4><p className={styles.sample}>{guide.sample}</p><CopyText text={guide.sample} label="依頼例文をコピー" /></> : null}
      <h4>チェックポイント</h4><ul>{guide.checks.map(check => <li key={check}>{check}</li>)}</ul>
      {guide.avoid ? <><h4>避けたいこと</h4><ul>{guide.avoid.map(item => <li key={item}>{item}</li>)}</ul></> : null}
      {guide.generation ? <DraftEditor guide={guide} schoolId={schoolId} snapshot={snapshot} /> : null}
      {guide.relatedPhotos ? <details><summary>関連する写真のお手本</summary>{guide.relatedPhotos.map(id => <ActionExecutionGuide key={id} guide={guideRegistry.get(id)} schoolId={schoolId} />)}</details> : null}
      <div className={styles.actions}><Link href={`${guide.path}?schoolId=${encodeURIComponent(schoolId)}`}>{guide.cta} →</Link>{onExecute ? <button type="button" onClick={onExecute}>確認・実行記録へ進む</button> : null}</div>
      <details><summary>詳しい手順・注意事項</summary><p>{guide.details}</p></details>
    </div> : null}
  </details>;
}
