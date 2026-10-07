"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import styles from "./page.module.css";
type District = { id: string; name: string; focusPoint: string; aiMessage: string };
const empty = { name: "", focusPoint: "", aiMessage: "" };
export default function Page() {
  const schoolId = useSearchParams().get("schoolId") || "";
  return <main className={styles.page}><header className={styles.header}><h1>近隣競合塾・校区別キーワード分析</h1></header>
    {!schoolId || schoolId === "all" ? <p>ヘッダーから校舎を選択してください。</p> : <Manager key={schoolId} schoolId={schoolId} />}</main>;
}
function Manager({ schoolId }: { schoolId: string }) {
  const [items, setItems] = useState<District[]>([]);
  const [selected, setSelected] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = items.find(item => item.id === selected);
  async function api(method: string, id?: string, body?: typeof empty) {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    if (!data.session) throw new Error("ログインしてください。");
    const params = new URLSearchParams({ schoolId });
    if (id) params.set("id", id);
    const response = await fetch(`/api/dashboard/keywords/districts?${params}`, { method, cache: "no-store", headers: { authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "対象校区が見つかりません。再取得してください。");
    return result;
  }
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    void api("GET").then(result => {
      if (!Array.isArray(result.districts)) throw new Error("校区データの形式が不正です。");
      if (!cancelled) { setItems(result.districts); setSelected(previous => result.districts.some((item: District) => item.id === previous) ? previous : result.districts[0]?.id || ""); }
    }).catch(failure => { if (!cancelled) setError(failure instanceof Error ? failure.message : "取得に失敗しました。"); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // The keyed manager remounts on school changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
  async function save(method: "POST" | "PATCH" | "DELETE") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await api(method, method === "DELETE" ? selected : editing || undefined, method === "DELETE" ? undefined : form);
      setForm(empty); setEditing(null); setConfirmDelete(false); setNotice(method === "DELETE" ? "校区を削除しました。" : "校区を保存しました。"); setRevision(value => value + 1);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "保存に失敗しました。"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <><section className={styles.panel}><h2>登録済み校区</h2>
    <button type="button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>再取得</button>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p>読み込み中</p> : <>
      <select aria-label="校区選択" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setConfirmDelete(false); setEditing(null); setForm(empty); }}>
        {!items.length && <option value="">校区未登録</option>}{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      {active && <><h3>自校の打ち出しポイント</h3><p>{active.focusPoint || "未入力"}</p><h3>地域向けメッセージ（登録内容）</h3><p>{active.aiMessage || "未入力"}</p>
        <button type="button" disabled={busy} onClick={() => { setEditing(active.id); setForm({ name: active.name, focusPoint: active.focusPoint, aiMessage: active.aiMessage }); }}>編集</button>
        <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>削除</button>
        {confirmDelete && <div role="group" aria-label="削除確認"><p>「{active.name}」を削除しますか？</p><button type="button" disabled={busy} onClick={() => void save("DELETE")}>削除を確定</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>キャンセル</button></div>}
      </>}
    </>}
  </section><section className={styles.panel}><h2>{editing ? "校区を編集" : "校区を追加"}</h2>
    <form className={styles.districtForm} onSubmit={event => { event.preventDefault(); void save(editing ? "PATCH" : "POST"); }}>
      <label>校区名<input required maxLength={100} value={form.name} disabled={busy} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label>打ち出しポイント<textarea maxLength={2000} value={form.focusPoint} disabled={busy} onChange={event => setForm({ ...form, focusPoint: event.target.value })} /></label>
      <label>地域向けメッセージ<textarea maxLength={4000} value={form.aiMessage} disabled={busy} onChange={event => setForm({ ...form, aiMessage: event.target.value })} /></label>
      <button disabled={busy || loading || !form.name.trim()}>{busy ? "保存中" : "保存"}</button>
      {editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setForm(empty); }}>編集をキャンセル</button>}
    </form>
  </section></>;
}
