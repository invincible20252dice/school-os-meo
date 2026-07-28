import {
  buildMeoExtendedData,
  countDetectedSuggestions,
} from "@/lib/mock/meoExtendedData";
import styles from "./page.module.css";

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export default function ProtectionSettingsPage() {
  const data = buildMeoExtendedData();
  const detectedCount = countDetectedSuggestions(data.protection?.fields);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Profile Protection</p>
        <h1>ビジネス情報改ざん防止</h1>
        <p>Googleプロフィールの重要項目をロックし、第三者提案を検知して正解データへ戻します。</p>
      </header>

      <section className={styles.summary}>
        <div className={styles.panelTitle}>
          <LockIcon />
          <div>
            <h2>一括書き戻し保護</h2>
            <p>検知中の改ざん提案: {detectedCount}件</p>
          </div>
        </div>
        <label className={styles.switch}>
          <input type="checkbox" defaultChecked={data.protection?.autoRestoreEnabled} />
          <span>正解データへ自動書き戻しを有効化</span>
        </label>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <LockIcon />
          <div>
            <h2>保護対象フィールド</h2>
            <p>ビジネス名、カテゴリ、電話番号、所在地、URLを監視します。</p>
          </div>
        </div>
        <div className={styles.fieldList}>
          {data.protection?.fields?.map((field) => (
            <article key={field?.key} className={styles.fieldCard}>
              <div className={styles.fieldTitle}>
                <LockIcon />
                <div>
                  <strong>{field?.label}</strong>
                  <span>{field?.locked ? "ロック中" : "未ロック"}</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>現在値</dt>
                  <dd>{field?.currentValue ?? "-"}</dd>
                </div>
                <div>
                  <dt>正解データ</dt>
                  <dd>{field?.correctValue ?? "-"}</dd>
                </div>
                <div>
                  <dt>検知した提案</dt>
                  <dd className={field?.detectedSuggestion ? styles.detected : undefined}>
                    {field?.detectedSuggestion ?? "なし"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
