import Link from "next/link";
import type { AioViewData } from "@/lib/aio-view";
import { compareAioPlaces, readActionHistory } from "@/lib/aio-comparison";
import { guideForAction } from "@/lib/action-guides";
import { ActionExecutionGuide } from "../challenge/action-guide";
import styles from "./live.module.css";

export function AioComparison({ data, schoolId }: { data: AioViewData; schoolId: string }) {
  const context = data.comparisonContext;
  const comparison = compareAioPlaces({ school: data.school || { name: "" }, keywords: data.keywords,
    places: context?.places || [], history: context?.history || readActionHistory(undefined), now: context?.asOf || new Date().toISOString() });
  const href = (path: string) => `${path}${path.includes("?") ? "&" : "?"}schoolId=${encodeURIComponent(schoolId)}`;
  const metric = (value: number | null, unit: string) => value === null ? "未取得" : `${Math.round(value * 10) / 10}${unit}`;
  return <>
    <section className={styles.section} aria-label="推奨競合との比較">
      <div className={styles.header}><h2>推奨競合との比較</h2><Link href={href("/dashboard/keywords/competitors")}>候補を確認</Link></div>
      {comparison.status === "UNAVAILABLE" ? <p>比較データ未取得。自塾と競合のGoogle実データが揃うまで、数値差は判断しません。</p> : <p>事実：照合済み{comparison.matched}店舗の保存データを参照しています。</p>}
      <p className={styles.caption}>1キーワード3候補・校舎全体5候補まで。中央値は項目ごとに取得できた店舗のみで算出し、未取得は0として扱いません。</p>
      <div className={styles.tableScroll}><table aria-label="Google保存データの中央値比較"><thead><tr><th>比較項目</th><th>自塾</th><th>競合中央値</th><th>対象店舗</th></tr></thead><tbody>{comparison.metrics.map(m => <tr key={m.key}><th>{m.label}</th><td>{metric(m.own, m.unit)}</td><td>{metric(m.median, m.unit)}</td><td>{m.sampleSize}店舗</td></tr>)}</tbody></table></div>
      <p>自塾の主要カテゴリ：{comparison.own?.category || "未取得"} / 掲載サービス：{comparison.own?.services?.join("、") || "未取得・掲載項目未確認"} / 公式サイトリンク：{comparison.own?.website == null ? "未取得" : comparison.own.website ? "あり" : "なし"}</p>
      {comparison.own ? <p className={styles.caption}>自塾の取得元：{comparison.own.source} / 取得日時：{new Date(comparison.own.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p> : null}
      <div className={styles.candidateList}>{comparison.candidates.map(c => <details key={c.name} className={styles.competitor}><summary>{c.name} <span>{c.place ? `照合済み・${c.confidence}` : "店舗未確定"}</span></summary>
        <p>{c.reason}</p><p>対象：{data.keywords.filter(k => c.keywordIds.includes(k.id)).map(k => k.keyword).join(" / ")}</p><blockquote>{c.evidence}</blockquote>
        {c.place ? <><p>Google保存データ：{c.place.name} / {c.place.address}</p><p>取得元：{c.place.source} / 取得日時：{new Date(c.place.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p><p>主要カテゴリ：{c.place.category || "未取得"} / 掲載サービス：{c.place.services?.join("、") || "未取得・掲載項目未確認"}</p></> : <p>競合候補の店舗を特定できませんでした。名称のみでは自動確定しません。</p>}
      </details>)}</div>
      {!comparison.candidates.length ? <p>根拠付きの推奨競合候補はありません。</p> : null}
      {comparison.omitted > 0 ? <p>候補上限により{comparison.omitted}店舗は今回の比較対象外です。</p> : null}
    </section>
    <section className={styles.section} aria-label="今週やること">
      <div className={styles.header}><h2>今週やること</h2><Link href={href("/dashboard/roi")}>Google経由の問い合わせ・面談を見る</Link></div>
      <p className={styles.caption}>School OSの判断：Google集客の改善候補です。OpenAIの推奨理由や、実行による掲載・問い合わせ増加を保証するものではありません。</p>
      {comparison.historyStatus === "UNAVAILABLE" ? <p role="status">実行履歴を確認できないため、重複防止のための提案を保留しています。</p> : !comparison.actions.length ? <p>現在、新しい提案はありません。直近7日の完了・対応中アクションも除外しています。</p> : null}
      <ol className={styles.actions} data-testid="aio-school-actions">{comparison.actions.map(action => <li key={action.key}>
        <h3>{action.title}</h3><p>{action.priority} / {action.minutes}分 / 根拠：{action.basis}</p><p>事実：{action.fact}</p><p>判断：{action.reason}</p>
        <p>対象テーマ：{data.keywords.filter(k => action.keywordIds.includes(k.id)).map(k => k.keyword).join(" / ")}</p>
        <ActionExecutionGuide guide={guideForAction(action.key)} schoolId={schoolId} /><Link href={href(action.path)}>改善を始める</Link>
      </li>)}</ol>
    </section>
  </>;
}
