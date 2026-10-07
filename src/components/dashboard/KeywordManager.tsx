"use client";
import { useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { DashboardRankingKeyword } from "@/lib/dashboard-rankings";
import styles from "./KeywordManager.module.css";

export default function KeywordManager({ schoolId, onChanged }: { schoolId: string; onChanged: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DashboardRankingKeyword[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState({ keyword: "", location: "", municipality: "", nearestStation: "" });
  async function api(method: string, id?: string) {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    if (!data.session) throw new Error("ログインしてください。");
    const params = new URLSearchParams({ schoolId });
    if (id) params.set("id", id);
    const response = await fetch(`/api/dashboard/keywords?${params}`, { method, cache: "no-store", headers: { authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ schoolId, ...form }) : undefined });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error || "キーワードを更新できませんでした。");
    return body;
  }
  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true); setError("");
    void api("GET").then(body => { if (active) setItems(body.keywords); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
    // The parent keys this component by schoolId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  function close() { dialog.current?.close(); setOpen(false); trigger.current?.focus(); }
  async function mutate(method: "POST" | "DELETE", id?: string) {
    if (lock.current || busy) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await api(method, id);
      onChanged(); setDeleting(null);
      if (method === "POST") setForm(previous => ({ ...previous, keyword: "" }));
      setNotice(method === "POST" ? "キーワードを追加しました。" : "管理対象から削除しました。計測履歴は保持しています。");
      const body = await api("GET"); setItems(body.keywords);
    } catch (e) { setError(e instanceof Error ? e.message : "通信に失敗しました。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <><button type="button" ref={trigger} onClick={() => { setOpen(true); dialog.current?.showModal(); }}>キーワード管理</button>
    <dialog ref={dialog} className={styles.modal} aria-labelledby="keyword-manager-title" onCancel={close}>
      <header><h2 id="keyword-manager-title">キーワード管理</h2><button type="button" aria-label="閉じる" onClick={close}>×</button></header>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <ul>{items.map(item => <li key={item.id}><span>{item.keyword} / {item.location}</span><button type="button" disabled={busy} onClick={() => setDeleting(item.id)}>削除</button>{deleting === item.id && <div><p>「{item.keyword}」を管理対象から削除しますか？</p><button type="button" disabled={busy} onClick={() => void mutate("DELETE", item.id)}>削除を確定</button><button type="button" onClick={() => setDeleting(null)}>キャンセル</button></div>}</li>)}</ul>
      {!busy && !items.length && <p>登録済みキーワードはありません。</p>}
      <form onSubmit={event => { event.preventDefault(); void mutate("POST"); }}>
        <h3>キーワード追加</h3>
        {([["keyword", "キーワード"], ["location", "計測地点"], ["municipality", "市町村"], ["nearestStation", "最寄り駅"]] as const).map(([key, label]) => <label key={key}>{label}<input required maxLength={200} disabled={busy} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} /></label>)}
        <button disabled={busy}>{busy ? "処理中" : "追加"}</button>
      </form>
    </dialog></>;
}
