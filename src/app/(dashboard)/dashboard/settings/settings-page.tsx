"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  buildEmptySchoolSetting,
  buildSettingsTabs,
  maskSecret,
  normalizeSchoolSetting,
  type NullableSchoolSettingState,
  type SchoolSettingState,
  validateSchoolSetting,
} from "@/lib/settings";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import TestReviewNotificationButton from "@/components/dashboard/TestReviewNotificationButton";
import styles from "./settings.module.css";

type SettingsTab = "google" | "line" | "instagram" | "prompts";

type GbpLocationOption = {
  accountName: string;
  accountDisplayName: string;
  name: string;
  title: string;
  locationId: string;
  address: string;
  placeId: string;
};

type DashboardContextResponse = {
  currentSchoolId?: string;
  message?: string;
};

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
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [setting, setSetting] = useState<SchoolSettingState>(() =>
    normalizeSchoolSetting(initialSetting ?? buildEmptySchoolSetting("")),
  );
  const [gbpLocations, setGbpLocations] = useState<GbpLocationOption[]>([]);
  const [selectedGbpLocationName, setSelectedGbpLocationName] = useState("");
  const [manualGbpLocationId, setManualGbpLocationId] = useState("");
  const [googleMessage, setGoogleMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isLoadingSchoolSetting, setIsLoadingSchoolSetting] = useState(false);
  const [isLoadingGbpLocations, setIsLoadingGbpLocations] = useState(false);
  const [isSavingGbpLocation, setIsSavingGbpLocation] = useState(false);
  const [isSavingSchoolSetting, setIsSavingSchoolSetting] = useState(false);
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

  async function buildAuthHeaders(): Promise<Record<string, string>> {
    try {
      const { data } = await createBrowserSupabaseClient().auth.getSession();
      const token = data.session?.access_token;

      return token ? { authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  }

  function getActiveSchoolId() {
    return searchParams.get("schoolId") || setting.schoolId;
  }

  async function resolveActiveSchoolId(headers: Record<string, string>) {
    const explicitSchoolId = searchParams.get("schoolId") || setting.schoolId;

    if (explicitSchoolId && explicitSchoolId !== "school-demo-001") {
      return explicitSchoolId;
    }

    const contextResponse = await fetch("/api/dashboard/context", { headers });
    const contextData = (await contextResponse.json()) as DashboardContextResponse;

    if (!contextResponse.ok) {
      throw new Error(contextData.message || "校舎情報を取得できませんでした。");
    }

    return contextData.currentSchoolId || "";
  }

  async function loadSchoolSetting() {
    setIsLoadingSchoolSetting(true);
    setSaveMessage("");
    try {
      const headers = await buildAuthHeaders();
      const schoolId = await resolveActiveSchoolId(headers);

      if (!schoolId) {
        setSetting(buildEmptySchoolSetting(""));
        setSelectedGbpLocationName("");
        setSaveMessage("校舎を選択してください。");
        return;
      }

      const response = await fetch(
        `/api/settings/school?schoolId=${encodeURIComponent(schoolId)}`,
        { headers },
      );
      const data = (await response.json()) as {
        message?: string;
        setting?: NullableSchoolSettingState | null;
        school?: { id: string; name: string; gbpLocationId?: string | null };
      };

      if (!response.ok) {
        setSaveMessage(data.message || "校舎設定を取得できませんでした。");
        return;
      }

      if (data.setting) {
        const nextSetting = normalizeSchoolSetting({
          ...data.setting,
          schoolId: data.school?.id || data.setting.schoolId,
          selectedGbpLocationId:
            data.setting.selectedGbpLocationId ||
            data.school?.gbpLocationId ||
            "",
        });
        setSetting(nextSetting);
        setSelectedGbpLocationName(nextSetting.selectedGbpLocationId);
        setManualGbpLocationId(nextSetting.selectedGbpLocationId);
      } else if (data.school?.id) {
        setSetting(buildEmptySchoolSetting(data.school.id));
        setSelectedGbpLocationName("");
        setManualGbpLocationId("");
      }
    } catch {
      setSaveMessage("校舎設定を取得できませんでした。");
    } finally {
      setIsLoadingSchoolSetting(false);
    }
  }

  async function saveSchoolSetting() {
    setIsSavingSchoolSetting(true);
    setSaveMessage("");

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch("/api/settings/school", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          ...setting,
          schoolId: getActiveSchoolId(),
          googleRefreshToken: undefined,
          instagramAccessToken: undefined,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        setting?: NullableSchoolSettingState;
      };

      if (!response.ok) {
        setSaveMessage(data.message || "校舎設定を保存できませんでした。");
        return;
      }

      if (data.setting) {
        setSetting(normalizeSchoolSetting(data.setting));
      }
      setSaveMessage("校舎設定を保存しました。");
    } catch {
      setSaveMessage("校舎設定を保存できませんでした。");
    } finally {
      setIsSavingSchoolSetting(false);
    }
  }

  async function loadGbpLocations() {
    setIsLoadingGbpLocations(true);
    setGoogleMessage("");

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch(
        `/api/google/gbp-locations?schoolId=${encodeURIComponent(
          getActiveSchoolId(),
        )}`,
        { headers },
      );
      const data = (await response.json()) as {
        message?: string;
        locations?: GbpLocationOption[];
        selectedGbpLocationId?: string;
      };

      if (!response.ok) {
        setGoogleMessage(data.message || "GBP店舗一覧を取得できませんでした。");
        return;
      }

      const locations = data.locations || [];
      setGbpLocations(locations);
      const selectedLocation =
        data.selectedGbpLocationId ||
        setting.selectedGbpLocationId ||
        locations[0]?.name ||
        "";
      setSelectedGbpLocationName(selectedLocation);
      setManualGbpLocationId(selectedLocation);
      setGoogleMessage(
        locations.length
          ? "GBP店舗一覧を取得しました。校舎に紐付ける店舗を選択してください。"
          : "連携中のGoogleアカウントで取得できるGBP店舗がありませんでした。",
      );
    } catch {
      setGoogleMessage("GBP店舗一覧を取得できませんでした。");
    } finally {
      setIsLoadingGbpLocations(false);
    }
  }

  async function saveGbpLocationSelection() {
    const selectedLocation = gbpLocations.find(
      (location) => location.name === selectedGbpLocationName,
    );

    if (!selectedLocation) {
      setGoogleMessage("保存するGBP店舗を選択してください。");
      return;
    }

    setIsSavingGbpLocation(true);
    setGoogleMessage("");

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch("/api/google/gbp-location-selection", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          schoolId: getActiveSchoolId(),
          accountName: selectedLocation.accountName,
          locationName: selectedLocation.name,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        setting?: NullableSchoolSettingState;
      };

      if (!response.ok) {
        setGoogleMessage(data.message || "GBP店舗の紐付けを保存できませんでした。");
        return;
      }

      if (data.setting) {
        setSetting((current) =>
          normalizeSchoolSetting({
            ...current,
            ...data.setting,
            googleRefreshToken: current.googleRefreshToken,
          }),
        );
      }
      setManualGbpLocationId(selectedGbpLocationName);
      setGoogleMessage("GBP店舗の紐付けを保存しました。");
    } catch {
      setGoogleMessage("GBP店舗の紐付けを保存できませんでした。");
    } finally {
      setIsSavingGbpLocation(false);
    }
  }

  function normalizeManualGbpLocationId(value: string) {
    const locationId = value.trim().replace(/^\/+/, "");

    if (!locationId) {
      return "";
    }

    return locationId.startsWith("locations/")
      ? locationId
      : `locations/${locationId}`;
  }

  async function saveManualGbpLocationId() {
    const locationName = normalizeManualGbpLocationId(manualGbpLocationId);

    if (!locationName) {
      setGoogleMessage("保存するGBPロケーションIDを入力してください。");
      return;
    }

    setIsSavingGbpLocation(true);
    setGoogleMessage("");

    try {
      const headers = await buildAuthHeaders();
      const response = await fetch("/api/google/gbp-location-selection", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          schoolId: getActiveSchoolId(),
          locationName,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        setting?: NullableSchoolSettingState;
      };

      if (!response.ok) {
        setGoogleMessage(data.message || "GBP店舗IDを保存できませんでした。");
        return;
      }

      setSelectedGbpLocationName(locationName);
      setManualGbpLocationId(locationName);
      setSetting((current) =>
        normalizeSchoolSetting({
          ...current,
          ...data.setting,
          googleConnected: true,
          selectedGbpLocationId: locationName,
          googleAccountId:
            data.setting?.googleAccountId || current.googleAccountId,
          googleRefreshToken: current.googleRefreshToken,
        }),
      );
      setGoogleMessage("手動入力したGBP店舗IDを保存しました。");
    } catch {
      setGoogleMessage("GBP店舗IDを保存できませんでした。");
    } finally {
      setIsSavingGbpLocation(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "google") {
      return;
    }

    const params =
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search);
    const connectedMessage = params.get("google_connected");
    const errorMessage = params.get("google_error");

    if (connectedMessage) {
      setGoogleMessage(
        "Googleアカウント連携が完了しました。GBP店舗一覧を取得して校舎に紐付けてください。",
      );
    } else if (errorMessage) {
      setGoogleMessage(errorMessage);
    }

  }, [activeTab, searchParams]);

  useEffect(() => {
    void loadSchoolSetting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
              <div className={styles.connectionSummary}>
                <span
                  className={
                    setting.googleConnected
                      ? styles.connectedBadge
                      : styles.mutedBadge
                  }
                >
                  {setting.googleConnected ? "連携済み" : "未連携"}
                </span>
                <dl className={styles.accountGrid}>
                  <div>
                    <dt>Googleアカウント</dt>
                    <dd>
                      {isLoadingSchoolSetting
                        ? "取得中"
                        : setting.googleAccountId || "未連携"}
                    </dd>
                  </div>
                  <div>
                    <dt>Refresh Token</dt>
                    <dd>{maskSecret(setting.googleRefreshToken)}</dd>
                  </div>
                  <div>
                    <dt>連携対象GBP店舗</dt>
                    <dd>{setting.selectedGbpLocationId || "未選択"}</dd>
                  </div>
                </dl>
              </div>
              <div className={styles.actionRow}>
                <a
                  href={`/api/auth/google?schoolId=${encodeURIComponent(
                    getActiveSchoolId(),
                  )}`}
                >
                  Googleアカウント連携（OAuth）
                </a>
                <button
                  type="button"
                  onClick={loadGbpLocations}
                  disabled={!setting.googleConnected || isLoadingGbpLocations}
                >
                  {isLoadingGbpLocations ? "店舗一覧を取得中" : "GBP店舗一覧を取得"}
                </button>
                <p>
                  Google Cloud Consoleの承認済みリダイレクトURIに
                  `/api/auth/callback/google` を設定してください。
                </p>
              </div>
              <label className={styles.full}>
                <span>校舎に紐付けるGBP店舗</span>
                <select
                  value={selectedGbpLocationName}
                  onChange={(event) =>
                    setSelectedGbpLocationName(event.target.value)
                  }
                  disabled={!gbpLocations.length}
                >
                  {!gbpLocations.length ? (
                    <option value="">GBP店舗一覧を取得してください</option>
                  ) : null}
                  {gbpLocations.map((location) => (
                    <option key={location.name} value={location.name}>
                      {location.title} / {location.accountDisplayName} /{" "}
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedGbpLocationName ? (
                <div className={styles.locationPreview}>
                  {gbpLocations
                    .filter(
                      (location) => location.name === selectedGbpLocationName,
                    )
                    .map((location) => (
                      <div key={location.name}>
                        <strong>{location.title}</strong>
                        <span>{location.address || "住所情報なし"}</span>
                        <span>Place ID: {location.placeId || "未取得"}</span>
                      </div>
                    ))}
                </div>
              ) : null}
              <div className={styles.actionRow}>
                <button
                  type="button"
                  onClick={saveGbpLocationSelection}
                  disabled={!selectedGbpLocationName || isSavingGbpLocation}
                >
                  {isSavingGbpLocation ? "保存中" : "選択したGBP店舗を保存"}
                </button>
                {googleMessage ? <p>{googleMessage}</p> : null}
              </div>
              <label className={styles.full}>
                <span>
                  またはGBPロケーションIDを手動入力（例: locations/1234567890 または 1234567890）
                </span>
                <input
                  value={manualGbpLocationId}
                  onChange={(event) =>
                    setManualGbpLocationId(event.target.value)
                  }
                  placeholder="locations/1234567890"
                />
              </label>
              <div className={styles.actionRow}>
                <button
                  type="button"
                  onClick={saveManualGbpLocationId}
                  disabled={!manualGbpLocationId.trim() || isSavingGbpLocation}
                >
                  {isSavingGbpLocation
                    ? "保存中"
                    : "手動入力した店舗IDを保存"}
                </button>
              </div>
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
                    getActiveSchoolId(),
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
              <p className={styles.valid}>
                {saveMessage ||
                  (isLoadingSchoolSetting
                    ? "校舎設定を読み込んでいます。"
                    : "保存可能な設定です。")}
              </p>
            )}
            <button
              type="button"
              onClick={saveSchoolSetting}
              disabled={isSavingSchoolSetting || isLoadingSchoolSetting || Boolean(errors.length)}
            >
              {isSavingSchoolSetting ? "保存中" : "設定を保存"}
            </button>
            <Link href="/dashboard">ダッシュボードへ戻る</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
