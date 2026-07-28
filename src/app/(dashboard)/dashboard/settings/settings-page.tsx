"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildMockSchoolSetting,
  buildSettingsTabs,
  maskSecret,
  normalizeSchoolSetting,
  type NullableSchoolSettingState,
  type SchoolSettingState,
  validateSchoolSetting,
} from "@/lib/settings";
import TestReviewNotificationButton from "@/components/dashboard/TestReviewNotificationButton";
import styles from "./settings.module.css";

type SettingsTab = "google" | "line" | "instagram" | "prompts";

function SettingsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2 3-.2-.1a1.8 1.8 0 0 0-1.9-.1l-.5.2a1.7 1.7 0 0 0-1 1.4V22h-4v-.3a1.7 1.7 0 0 0-1-1.4l-.5-.2a1.8 1.8 0 0 0-1.9.1l-.2.1-2-3 .1-.1A1.6 1.6 0 0 0 4.6 15l-.2-.5a1.8 1.8 0 0 0-1.4-1H3v-3h.3a1.8 1.8 0 0 0 1.4-1l.2-.5a1.6 1.6 0 0 0-.3-1.8l-.1-.1 2-3 .2.1a1.8 1.8 0 0 0 1.9.1l.5-.2a1.7 1.7 0 0 0 1-1.4V2h4v.3a1.7 1.7 0 0 0 1 1.4l.5.2a1.8 1.8 0 0 0 1.9-.1l.2-.1 2 3-.1.1a1.6 1.6 0 0 0-.3 1.8l.2.5a1.8 1.8 0 0 0 1.4 1h.3v3h-.3a1.8 1.8 0 0 0-1.4 1l-.1.5z" />
    </svg>
  );
}

function parseList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyList(values: string[]) {
  return values.join("\n");
}

export default function SettingsPage({
  initialTab = "google",
  initialSetting,
}: {
  initialTab?: SettingsTab;
  initialSetting?: NullableSchoolSettingState;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [setting, setSetting] = useState<SchoolSettingState>(() =>
    normalizeSchoolSetting(initialSetting ?? buildMockSchoolSetting()),
  );
  const tabs = buildSettingsTabs();
  const errors = useMemo(() => validateSchoolSetting(setting), [setting]);
  const instagramIsConnected =
    setting.instagramConnected || Boolean(setting.instagramBusinessAccountId);

  function update<K extends keyof SchoolSettingState>(
    key: K,
    value: SchoolSettingState[K],
  ) {
    setSetting((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Settings</p>
        <h1>設定</h1>
        <p>
          Googleアカウント連携、LINE通知、AI生成プロンプトを校舎単位で管理します。
        </p>
      </header>

      <section className={styles.shell}>
        <div className={styles.tabs} role="tablist" aria-label="設定タブ">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? styles.activeTab : undefined}
              onClick={() => setActiveTab(tab.key as SettingsTab)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>
            <SettingsIcon />
            <div>
              <h2>
                {activeTab === "google"
                  ? "Googleアカウント連携"
                  : activeTab === "line"
                    ? "LINE通知設定"
                    : activeTab === "instagram"
                      ? "Instagram連携設定"
                      : "プロンプト設定"}
              </h2>
              <p>最終更新: {setting.updatedAt}</p>
            </div>
          </div>

          {activeTab === "google" ? (
            <div className={styles.formGrid}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={setting.googleConnected}
                  onChange={(event) =>
                    update("googleConnected", event.target.checked)
                  }
                />
                <span>Googleアカウント連携を有効化</span>
              </label>
              <label>
                <span>GoogleアカウントID</span>
                <input
                  value={setting.googleAccountId}
                  onChange={(event) =>
                    update("googleAccountId", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Refresh Token</span>
                <input
                  value={setting.googleRefreshToken}
                  onChange={(event) =>
                    update("googleRefreshToken", event.target.value)
                  }
                />
              </label>
              <label>
                <span>連携対象GBP店舗ID</span>
                <input
                  value={setting.selectedGbpLocationId}
                  onChange={(event) =>
                    update("selectedGbpLocationId", event.target.value)
                  }
                />
              </label>
            </div>
          ) : null}

          {activeTab === "line" ? (
            <div className={styles.formGrid}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={setting.lineNotifyEnabled}
                  onChange={(event) =>
                    update("lineNotifyEnabled", event.target.checked)
                  }
                />
                <span>LINE通知を有効化</span>
              </label>
              <label>
                <span>チャネルアクセストークン</span>
                <input
                  value={setting.lineChannelAccessToken}
                  onChange={(event) =>
                    update("lineChannelAccessToken", event.target.value)
                  }
                />
              </label>
              <label>
                <span>送信先グループID / ユーザーID</span>
                <input
                  value={setting.lineDestinationId}
                  onChange={(event) =>
                    update("lineDestinationId", event.target.value)
                  }
                />
              </label>
              <TestReviewNotificationButton
                compact
                lineChannelAccessToken={setting.lineChannelAccessToken}
                lineDestinationId={setting.lineDestinationId}
              />
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={setting.notifyOnNewReview}
                  onChange={(event) =>
                    update("notifyOnNewReview", event.target.checked)
                  }
                />
                <span>新着口コミ時に通知</span>
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={setting.notifyOnLowRating}
                  onChange={(event) =>
                    update("notifyOnLowRating", event.target.checked)
                  }
                />
                <span>★3以下の口コミをアラート通知</span>
              </label>
            </div>
          ) : null}

          {activeTab === "instagram" ? (
            <div className={styles.formGrid}>
              <div className={styles.connectionSummary}>
                <span
                  className={
                    instagramIsConnected
                      ? styles.connectedBadge
                      : styles.mutedBadge
                  }
                >
                  {instagramIsConnected ? "連携済み" : "未連携"}
                </span>
                <dl className={styles.accountGrid}>
                  <div>
                    <dt>Instagramアカウント名</dt>
                    <dd>
                      {setting.instagramAccountName || "アカウント名未取得"}
                    </dd>
                  </div>
                  <div>
                    <dt>Business Account ID</dt>
                    <dd>{setting.instagramBusinessAccountId || "未取得"}</dd>
                  </div>
                  <div>
                    <dt>アクセストークン</dt>
                    <dd>{maskSecret(setting.instagramAccessToken)}</dd>
                  </div>
                </dl>
              </div>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={instagramIsConnected}
                  onChange={(event) =>
                    update("instagramConnected", event.target.checked)
                  }
                />
                <span>
                  Instagramアカウント連携ステータス:{" "}
                  {instagramIsConnected ? "連携済み" : "未連携"}
                </span>
              </label>
              <label>
                <span>Meta App ID</span>
                <input
                  value={setting.instagramMetaAppId}
                  onChange={(event) =>
                    update("instagramMetaAppId", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Meta App Secret</span>
                <input
                  type="password"
                  value={setting.instagramMetaAppSecret}
                  onChange={(event) =>
                    update("instagramMetaAppSecret", event.target.value)
                  }
                />
              </label>
              <label>
                <span>Instagram Business Account ID</span>
                <input
                  value={setting.instagramBusinessAccountId}
                  placeholder="OAuth連携後に保存されます"
                  onChange={(event) =>
                    update("instagramBusinessAccountId", event.target.value)
                  }
                />
              </label>
              <div className={styles.actionRow}>
                <a
                  href={`/api/auth/instagram?schoolId=${encodeURIComponent(
                    setting.schoolId,
                  )}&metaAppId=${encodeURIComponent(setting.instagramMetaAppId)}`}
                >
                  Instagramアカウントを連携
                </a>
                <p>
                  ngrok公開URLのCallback
                  `/api/auth/callback/instagram` をMeta側にも設定してください。
                </p>
              </div>
            </div>
          ) : null}

          {activeTab === "prompts" ? (
            <div className={styles.formGrid}>
              <label className={styles.full}>
                <span>AIのペルソナ・立場設定</span>
                <textarea
                  rows={5}
                  value={setting.promptSystemRole}
                  onChange={(event) =>
                    update("promptSystemRole", event.target.value)
                  }
                />
              </label>
              <label>
                <span>返信トーン</span>
                <select
                  value={setting.promptReviewTone}
                  onChange={(event) =>
                    update("promptReviewTone", event.target.value)
                  }
                >
                  <option value="FRIENDLY">FRIENDLY</option>
                  <option value="FORMAL">FORMAL</option>
                  <option value="CASUAL">CASUAL</option>
                </select>
              </label>
              <label className={styles.full}>
                <span>NGワード（改行区切り）</span>
                <textarea
                  rows={4}
                  value={stringifyList(setting.promptForbiddenWords)}
                  onChange={(event) =>
                    update("promptForbiddenWords", parseList(event.target.value))
                  }
                />
              </label>
              <label className={styles.full}>
                <span>推奨キーワード（改行区切り）</span>
                <textarea
                  rows={4}
                  value={stringifyList(setting.promptMustKeywords)}
                  onChange={(event) =>
                    update("promptMustKeywords", parseList(event.target.value))
                  }
                />
              </label>
            </div>
          ) : null}

          <div className={styles.footer}>
            {errors.length ? (
              <div className={styles.errors}>
                {errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            ) : (
              <p className={styles.valid}>保存可能な設定です。</p>
            )}
            <Link href="/dashboard">ダッシュボードへ戻る</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
