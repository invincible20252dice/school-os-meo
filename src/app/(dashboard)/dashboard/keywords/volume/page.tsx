"use client";

import { useState } from "react";
import { DEMAND_SAMPLE } from "@/lib/mock/demand-sample";
import {
  filterKeywordVolumes,
  getVolumeMunicipalities,
} from "@/lib/mock/meoExtendedData";
import styles from "./page.module.css";

function DemandIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-4" />
    </svg>
  );
}

export default function KeywordVolumePage() {
  const municipalities = getVolumeMunicipalities(DEMAND_SAMPLE);
  const [selectedMunicipality, setSelectedMunicipality] = useState("熊本市中央区");
  const volumes = filterKeywordVolumes(DEMAND_SAMPLE, selectedMunicipality);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Search Demand</p>
        <h1>検索ボリューム＆地域需要チェック</h1>
        <p>市区郡ごとの検索需要、年間トレンド、クリック単価を比較します。</p>
        <p role="note">シミュレーション・実測値ではありません。熊本地域の運用検証用サンプルです。選択中の校舎の実績ではありません。</p>
      </header>

      <section className={styles.panel}>
        <div className={styles.panelTitle}>
          <DemandIcon />
          <div>
            <h2>地域需要フィルター</h2>
            <p role="status">現在の表示: {selectedMunicipality}（{volumes.length}件）</p>
          </div>
        </div>
        <div className={styles.filters}>
          {municipalities?.map((municipality) => (
            <button
              key={municipality}
              type="button"
              aria-pressed={municipality === selectedMunicipality}
              onClick={() => setSelectedMunicipality(municipality)}
              className={municipality === selectedMunicipality ? styles.activeFilter : undefined}
            >
              {municipality}
            </button>
          ))}
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>キーワード</th>
                <th>検索地点</th>
                <th>市区郡</th>
                <th>検索ボリューム</th>
                <th>年間トレンド</th>
                <th>CPC</th>
              </tr>
            </thead>
            <tbody>
              {volumes?.map((volume) => (
                <tr key={volume?.id}>
                  <td>
                    <strong>{volume?.keyword ?? "-"}</strong>
                  </td>
                  <td>{volume?.searchPoint ?? "-"}</td>
                  <td>{volume?.municipality ?? "-"}</td>
                  <td>{volume?.monthlyVolume?.toLocaleString("ja-JP") ?? 0}</td>
                  <td className={(volume?.yearlyTrendPercent ?? 0) >= 0 ? styles.up : styles.down}>
                    {(volume?.yearlyTrendPercent ?? 0) > 0 ? "+" : ""}
                    {volume?.yearlyTrendPercent ?? 0}%
                  </td>
                  <td>{volume?.cpcYen ?? 0}円</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
