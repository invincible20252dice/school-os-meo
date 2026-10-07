"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { SUPPORT_TOPICS } from "@/lib/support-faq";
import styles from "./SupportChat.module.css";

export default function SupportChat() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [messages, setMessages] = useState<Array<{ role: "質問" | "回答"; text: string }>>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, pending, error]);
  function close() { dialog.current?.close(); trigger.current?.focus(); }
  async function send(text: string) {
    if (busy.current || !text.trim()) return;
    busy.current = true; setPending(true); setError("");
    try {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      if (!data.session) throw new Error("ログインしてください。");
      const response = await fetch("/api/support/chat", {
        method: "POST", headers: { "Content-Type": "application/json", authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ message: text }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json();
      if (!response.ok || body.success !== true || typeof body.reply !== "string") throw new Error(body.error || "回答を取得できませんでした。再試行してください。");
      setMessages(previous => [...previous.slice(-38), { role: "質問", text }, { role: "回答", text: body.reply }]);
      setQuestion("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "通信に失敗しました。再試行してください。");
    } finally { busy.current = false; setPending(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(question); }
  return <>
    <button className={styles.launcher} ref={trigger} type="button" aria-haspopup="dialog" onClick={() => { dialog.current?.showModal(); input.current?.focus(); }}>使い方を聞く</button>
    <dialog ref={dialog} className={styles.panel} aria-labelledby="support-title" onCancel={close}>
      <header className={styles.header}><div><h2 id="support-title">使い方アシスタント</h2><span>FAQガイド</span></div><button type="button" onClick={close} aria-label="ヘルプを閉じる" title="閉じる">×</button></header>
      <div className={styles.log} ref={log} role="log" aria-live="polite">
        <p>どの操作についてお困りですか？個人情報やAPIキーは入力しないでください。</p>
        {messages.map((message, index) => <div className={message.role === "質問" ? styles.question : styles.answer} key={index}><small>{message.role}</small><p>{message.text}</p></div>)}
        {pending && <p role="status">回答を取得しています。</p>}
      </div>
      <div className={styles.topics}>{SUPPORT_TOPICS.map(topic => <button type="button" key={topic} disabled={pending} onClick={() => { setQuestion(topic); void send(topic); }}>{topic}</button>)}</div>
      <form onSubmit={submit} className={styles.form}>
        {error && <p role="alert">{error}</p>}
        <label htmlFor="support-question">質問</label>
        <textarea id="support-question" ref={input} value={question} maxLength={1000} rows={2} disabled={pending} onChange={event => setQuestion(event.target.value)} />
        <button type="submit" disabled={pending || !question.trim()}>送信</button>
      </form>
    </dialog>
  </>;
}
