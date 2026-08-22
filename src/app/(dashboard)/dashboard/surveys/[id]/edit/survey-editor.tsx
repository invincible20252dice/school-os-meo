"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import {
  activateSurveySetting,
  buildSurveyPreviewSteps,
  deleteSurveySetting,
  moveSurveyItem,
  normalizeSurveyItemOrder,
  saveSurveySetting,
  type SurveyEditorItem,
  type SurveyEditorState,
  type SurveySettingListItem,
  type SurveyItemType,
  type SurveyWeekday,
  validateSurveyEditorState,
} from "@/lib/survey-builder";
import styles from "./survey-editor.module.css";

const itemTypes: Array<{ label: string; value: SurveyItemType }> = [
  { label: "一つ選択", value: "SINGLE_SELECT" },
  { label: "複数選択", value: "MULTI_SELECT" },
  { label: "自由記述", value: "TEXT" },
];
const weekdays: SurveyWeekday[] = ["月", "火", "水", "木", "金", "土", "日"];

type SurveyApiItem = {
  id: string;
  type: string;
  question: string;
  maxSelect?: number | null;
  options: string[];
  order: number;
};

type SurveyApiListItem = {
  id: string;
  schoolId: string;
  title: string;
  requiredKeywords: string;
  minCharCount: number;
  maxCharCount: number;
  isValid: boolean;
  hasIncentive: boolean;
  benefitType: string;
  benefitShowTiming: string;
  items: SurveyApiItem[];
  createdAt: string;
  updatedAt: string;
};

type SurveysApiResponse = {
  surveys?: SurveyApiListItem[];
  access?: {
    effectiveSchoolId?: string;
  };
  message?: string;
};

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.icon}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.buttonIcon}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.buttonIcon}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.buttonIcon}>
      <path d="M12 5v14" />
      <path d="M19 12l-7 7-7-7" />
    </svg>
  );
}

function parseOptions(value: string) {
  return value
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
}

function serializeOptions(options: string[]) {
  return options.join("\n");
}

function createItem(order: number): SurveyEditorItem {
  return {
    id: `item-${Date.now()}`,
    type: "SINGLE_SELECT",
    question: "新しい設問",
    options: ["選択肢1", "選択肢2"],
    order,
  };
}

function buildNewSurveyState(schoolId: string): SurveyEditorState {
  return {
    id: "new",
    schoolId,
    title: "新しいアンケート",
    requiredKeywords: "",
    minCharCount: 100,
    maxCharCount: 300,
    isValid: false,
    hasIncentive: false,
    benefitType: "",
    benefitShowTiming: "",
    activeWeekdays: ["月", "火", "水", "木", "金"],
    items: [
      {
        id: "item-1",
        type: "MULTI_SELECT",
        question: "良かったと感じた点を選んでください",
        maxSelect: 3,
        options: ["先生の説明", "質問しやすさ", "教室の雰囲気"],
        order: 1,
      },
      {
        id: "item-2",
        type: "TEXT",
        question: "印象に残っている変化を教えてください",
        options: [],
        order: 2,
      },
    ],
  };
}

function normalizeItemType(type: string): SurveyItemType {
  if (type === "SINGLE_CHOICE") {
    return "SINGLE_SELECT";
  }

  if (type === "MULTIPLE_CHOICE") {
    return "MULTI_SELECT";
  }

  if (type === "FREE_TEXT") {
    return "TEXT";
  }

  return ["SINGLE_SELECT", "MULTI_SELECT", "TEXT"].includes(type)
    ? (type as SurveyItemType)
    : "TEXT";
}

function formatApiDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "日時なし";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replaceAll("/", "-");
}

function toEditorState(row: SurveyApiListItem): SurveySettingListItem {
  return {
    id: row.id,
    schoolId: row.schoolId,
    title: row.title,
    requiredKeywords: row.requiredKeywords,
    minCharCount: row.minCharCount,
    maxCharCount: row.maxCharCount,
    isValid: row.isValid,
    hasIncentive: row.hasIncentive,
    benefitType: row.benefitType,
    benefitShowTiming: row.benefitShowTiming,
    activeWeekdays: ["月", "火", "水", "木", "金"],
    items: normalizeSurveyItemOrder(
      [...row.items]
        .sort((a, b) => a.order - b.order)
        .map((item, index) => ({
          id: item.id,
          type: normalizeItemType(item.type),
          question: item.question,
          maxSelect: item.maxSelect ?? undefined,
          options: item.options,
          order: item.order || index + 1,
        })),
    ),
    createdAt: formatApiDate(row.createdAt),
    updatedAt: formatApiDate(row.updatedAt),
  };
}

function nowLabel() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return date.replaceAll("/", "-");
}

export default function SurveyEditor({ surveyId }: { surveyId: string }) {
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<SurveySettingListItem[]>([]);
  const [survey, setSurvey] = useState<SurveyEditorState>(() =>
    buildNewSurveyState(searchParams.get("schoolId") || ""),
  );
  const [editingExistingId, setEditingExistingId] = useState<string | null>(() =>
    surveyId === "new" ? null : surveyId,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const errors = useMemo(() => validateSurveyEditorState(survey), [survey]);
  const previewSteps = useMemo(() => buildSurveyPreviewSteps(survey), [survey]);

  function getSelectedSchoolId() {
    return searchParams.get("schoolId") || "";
  }

  function getSaveSchoolId() {
    return getSelectedSchoolId() || survey.schoolId;
  }

  function updateSurvey<K extends keyof SurveyEditorState>(
    key: K,
    value: SurveyEditorState[K],
  ) {
    setSurvey((current) => ({ ...current, [key]: value }));
  }

  function updateItem(id: string, patch: Partial<SurveyEditorItem>) {
    setSurvey((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addItem() {
    setSurvey((current) => ({
      ...current,
      items: [...current.items, createItem(current.items.length + 1)],
    }));
  }

  function removeItem(id: string) {
    setSurvey((current) => ({
      ...current,
      items: current.items
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index + 1 })),
    }));
  }

  function moveItem(id: string, direction: "up" | "down") {
    setSurvey((current) => ({
      ...current,
      items: moveSurveyItem(current.items, id, direction),
    }));
  }

  function toggleWeekday(weekday: SurveyWeekday) {
    setSurvey((current) => {
      const selected = current.activeWeekdays.includes(weekday);

      return {
        ...current,
        activeWeekdays: selected
          ? current.activeWeekdays.filter((item) => item !== weekday)
          : weekdays.filter((item) => [...current.activeWeekdays, weekday].includes(item)),
      };
    });
  }

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const { data } = await createBrowserSupabaseClient().auth.getSession();
    const token = data.session?.access_token;

    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function loadSurveys() {
    setIsLoading(true);
    setNotice(null);

    try {
      const params = new URLSearchParams();
      const requestedSchoolId = getSelectedSchoolId();

      if (requestedSchoolId) {
        params.set("schoolId", requestedSchoolId);
      }

      if (surveyId !== "new") {
        params.set("id", surveyId);
      }

      const response = await fetch(`/api/surveys?${params.toString()}`, {
        headers: await getAuthHeaders(),
        cache: "no-store",
      });
      const data = (await response.json()) as SurveysApiResponse;

      if (!response.ok) {
        throw new Error(data.message || "アンケート設定を取得できませんでした。");
      }

      const loadedSettings = (data.surveys || []).map(toEditorState);
      const activeSchoolId =
        requestedSchoolId ||
        data.access?.effectiveSchoolId ||
        loadedSettings[0]?.schoolId ||
        "";
      setSettings(loadedSettings);

      if (surveyId === "new") {
        setSurvey(buildNewSurveyState(activeSchoolId));
        setEditingExistingId(null);
        return;
      }

      const target = loadedSettings.find((setting) => setting.id === surveyId);

      if (!target) {
        setSurvey(buildNewSurveyState(activeSchoolId));
        setEditingExistingId(null);
        setNotice("対象のアンケート設定が見つかりませんでした。");
        return;
      }

      setSurvey({
        ...target,
        schoolId: activeSchoolId || target.schoolId,
      });
      setEditingExistingId(target.id);
      setNotice(`${target.title}をDBから読み込みました。`);
    } catch (error) {
      setSettings([]);
      setNotice(
        error instanceof Error
          ? error.message
          : "アンケート設定を取得できませんでした。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSurvey() {
    if (errors.length > 0) {
      setNotice("入力内容を確認してください。");
      return;
    }

    setIsSaving(true);

    try {
      const surveyToSave = {
        ...survey,
        schoolId: getSaveSchoolId(),
        items: normalizeSurveyItemOrder(survey.items),
      };
      const response = await fetch("/api/surveys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify(surveyToSave),
      });
      const data = (await response.json()) as {
        survey?: { id: string };
        message?: string;
      };

      if (!response.ok || !data.survey?.id) {
        throw new Error(data.message || "アンケート設定を保存できませんでした。");
      }

      const persistedSurvey = { ...surveyToSave, id: data.survey.id };
      setSurvey(persistedSurvey);
      setSettings((current) =>
        saveSurveySetting(current, persistedSurvey, nowLabel()),
      );
      setEditingExistingId(data.survey.id);
      setNotice("アンケート設定をDBへ保存しました。");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "アンケート設定を保存できませんでした。",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function discardEdit() {
    setSurvey(buildNewSurveyState(getSaveSchoolId()));
    setEditingExistingId(null);
    setNotice("新規作成モードに切り替えました。");
  }

  function editSetting(setting: SurveySettingListItem) {
    setSurvey(setting);
    setEditingExistingId(setting.id);
    setNotice(`${setting.title}を編集中です。`);
  }

  function activateSetting(settingId: string) {
    setSettings((current) => activateSurveySetting(current, settingId));
    setSurvey((current) =>
      current.id === settingId
        ? {
            ...current,
            isValid: true,
          }
        : current,
    );
    setNotice("適用中のアンケートを更新しました。");
  }

  function removeSetting(settingId: string) {
    if (!window.confirm("このアンケートを削除してもよろしいですか？")) {
      return;
    }

    setSettings((current) => {
      const result = deleteSurveySetting(current, settingId);

      if (result.blockedReason) {
        setNotice(result.blockedReason);
        return current;
      }

      if (survey.id === settingId) {
        setSurvey(buildNewSurveyState(survey.schoolId));
        setEditingExistingId(null);
      }

      setNotice("アンケート設定を削除しました。");
      return result.settings;
    });
  }

  useEffect(() => {
    void loadSurveys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, searchParams]);

  if (isLoading) {
    return (
      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.kicker}>Survey Builder</p>
          <h1>アンケート設定</h1>
          <p>
            保存済みのアンケート設定を確認しています。読み込み完了後に編集画面を表示します。
          </p>
        </header>

        <section className={styles.loadingPanel} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <h2>DBからアンケート設定を読み込んでいます</h2>
            <p>初期データを表示せず、保存済みの内容だけを編集画面に反映します。</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.kicker}>Survey Builder</p>
        <h1>アンケート設定</h1>
        <p>
          設問・口コミ生成条件・特典表示を編集すると、右側のスマホプレビューに即時反映されます。
        </p>
      </header>

      <section className={styles.grid}>
        <div className={styles.editor}>
          <section className={styles.actionPanel}>
            <div>
              <h2>{editingExistingId ? "アンケートを編集中" : "新規アンケート作成"}</h2>
              <p>
                保存すると作成済みアンケート一覧へ反映されます。適用中にできる設定は1件です。
              </p>
            </div>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={saveSurvey}
                disabled={isSaving}
              >
                {isSaving ? "保存中..." : editingExistingId ? "更新する" : "保存する"}
              </button>
              <button type="button" className={styles.secondaryButton} onClick={discardEdit}>
                {editingExistingId ? "編集内容を破棄" : "新規作成"}
              </button>
            </div>
            {notice ? <p className={styles.toast}>{notice}</p> : null}
            {isLoading ? <p className={styles.toast}>DBから読み込み中です。</p> : null}
          </section>

          <section className={styles.panel}>
            <h2>基本設定</h2>
            <div className={styles.fieldGrid}>
              <label>
                <span>アンケート名</span>
                <input
                  value={survey.title}
                  onChange={(event) => updateSurvey("title", event.target.value)}
                />
              </label>
              <label>
                <span>含めたいキーワード</span>
                <input
                  value={survey.requiredKeywords}
                  onChange={(event) =>
                    updateSurvey("requiredKeywords", event.target.value)
                  }
                />
              </label>
              <label>
                <span>最小文字数</span>
                <input
                  type="number"
                  value={survey.minCharCount}
                  onChange={(event) =>
                    updateSurvey("minCharCount", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>最大文字数</span>
                <input
                  type="number"
                  value={survey.maxCharCount}
                  onChange={(event) =>
                    updateSurvey("maxCharCount", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={survey.isValid}
                onChange={(event) => updateSurvey("isValid", event.target.checked)}
              />
              <span>アンケートを有効化</span>
            </label>
            <div className={styles.incentiveCard}>
              <div>
                <span>アンケート回答特典を付与する</span>
                <p>OFFの場合、特典情報は保存時に空の状態で保持します。</p>
              </div>
              <div className={styles.segmented} aria-label="特典の有無">
                <button
                  type="button"
                  className={survey.hasIncentive ? styles.segmentActive : undefined}
                  aria-pressed={survey.hasIncentive}
                  onClick={() => updateSurvey("hasIncentive", true)}
                >
                  特典をつける
                </button>
                <button
                  type="button"
                  className={!survey.hasIncentive ? styles.segmentActive : undefined}
                  aria-pressed={!survey.hasIncentive}
                  onClick={() => updateSurvey("hasIncentive", false)}
                >
                  特典をつけない
                </button>
              </div>
            </div>
            {survey.hasIncentive ? (
              <div className={styles.fieldGrid}>
                <label>
                  <span>特典</span>
                  <input
                    value={survey.benefitType}
                    onChange={(event) =>
                      updateSurvey("benefitType", event.target.value)
                    }
                  />
                </label>
                <label>
                  <span>特典表示タイミング</span>
                  <select
                    value={survey.benefitShowTiming}
                    onChange={(event) =>
                      updateSurvey("benefitShowTiming", event.target.value)
                    }
                  >
                    <option value="Google口コミ投稿後">Google口コミ投稿後</option>
                    <option value="アンケート完了後">アンケート完了後</option>
                    <option value="常時表示">常時表示</option>
                  </select>
                </label>
              </div>
            ) : (
              <p className={styles.incentiveOff}>特典なしで保存されます。</p>
            )}
            <div className={styles.weekdayCard}>
              <div>
                <span>公開曜日</span>
                <p>保護者にアンケートを表示する曜日を選択します。</p>
              </div>
              <div className={styles.weekdayButtons} aria-label="公開曜日">
                {weekdays.map((weekday) => {
                  const active = survey.activeWeekdays.includes(weekday);

                  return (
                    <button
                      key={weekday}
                      type="button"
                      className={active ? styles.weekdayActive : undefined}
                      aria-pressed={active}
                      onClick={() => toggleWeekday(weekday)}
                    >
                      {weekday}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>設問リスト</h2>
              <button type="button" onClick={addItem}>
                <PlusIcon />
                設問を追加
              </button>
            </div>

            <div className={styles.itemList}>
              {survey.items.map((item, index) => (
                <article key={item.id} className={styles.itemCard}>
                  <div className={styles.itemHeader}>
                    <strong>設問 {index + 1}</strong>
                    <div className={styles.itemActions}>
                      <button
                        type="button"
                        className={styles.moveButton}
                        onClick={() => moveItem(item.id, "up")}
                        disabled={index === 0}
                        aria-label={`設問 ${index + 1} を上に移動`}
                        title="上に移動"
                      >
                        <ArrowUpIcon />
                      </button>
                      <button
                        type="button"
                        className={styles.moveButton}
                        onClick={() => moveItem(item.id, "down")}
                        disabled={index === survey.items.length - 1}
                        aria-label={`設問 ${index + 1} を下に移動`}
                        title="下に移動"
                      >
                        <ArrowDownIcon />
                      </button>
                      <button type="button" onClick={() => removeItem(item.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                  <div className={styles.fieldGrid}>
                    <label>
                      <span>設問タイプ</span>
                      <select
                        value={item.type}
                        onChange={(event) =>
                          updateItem(item.id, {
                            type: event.target.value as SurveyItemType,
                            options:
                              event.target.value === "TEXT" ? [] : item.options,
                          })
                        }
                      >
                        {itemTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>設問文</span>
                      <input
                        value={item.question}
                        onChange={(event) =>
                          updateItem(item.id, { question: event.target.value })
                        }
                      />
                    </label>
                    {item.type === "MULTI_SELECT" ? (
                      <label>
                        <span>最大選択数</span>
                        <input
                          type="number"
                          value={item.maxSelect ?? 3}
                          onChange={(event) =>
                            updateItem(item.id, {
                              maxSelect: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    ) : null}
                    {item.type !== "TEXT" ? (
                      <label className={styles.full}>
                        <span>選択肢（改行区切り）</span>
                        <textarea
                          rows={4}
                          value={serializeOptions(item.options)}
                          onChange={(event) =>
                            updateItem(item.id, {
                              options: parseOptions(event.target.value),
                            })
                          }
                        />
                      </label>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            {errors.length ? (
              <div className={styles.errors}>
                {errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            ) : (
              <p className={styles.valid}>保存可能な設定です。</p>
            )}
          </section>
        </div>

        <aside className={styles.previewWrap}>
          <div className={styles.previewHeader}>
            <PhoneIcon />
            <div>
              <h2>スマホプレビュー</h2>
              <p>保護者画面での表示イメージ</p>
            </div>
          </div>
          <div className={styles.phone}>
            <div className={styles.phoneTop}>
              <strong>{survey.title}</strong>
              <span>{survey.isValid ? "公開中" : "停止中"}</span>
            </div>
            <p className={styles.keywords}>{survey.requiredKeywords}</p>
            {previewSteps.map((item) => (
              <section key={item.id} className={styles.previewStep}>
                <span>Q{item.order}</span>
                <h3>{item.question}</h3>
                <p>{item.helperText}</p>
                {item.type === "TEXT" ? (
                  <div className={styles.textPlaceholder}>自由記述入力欄</div>
                ) : (
                  <div className={styles.optionList}>
                    {item.options.map((option) => (
                      <button key={option} type="button">
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))}
            {survey.hasIncentive ? (
              <div className={styles.benefit}>
                <strong>{survey.benefitType || "特典名未設定"}</strong>
                <span>{survey.benefitShowTiming || "表示タイミング未設定"}</span>
              </div>
            ) : (
              <div className={styles.benefitOff}>特典なし</div>
            )}
          </div>

          <section className={styles.listPanel}>
            <div className={styles.previewHeader}>
              <div>
                <h2>作成済みアンケート一覧</h2>
                <p>選択・編集・削除をここで管理します。</p>
              </div>
            </div>
            <div className={styles.settingList}>
              {settings.map((setting) => (
                <article key={setting.id} className={styles.settingCard}>
                  <div className={styles.settingHeader}>
                    <div>
                      <strong>{setting.title}</strong>
                      <span>作成日時 {setting.createdAt}</span>
                    </div>
                    <div className={styles.badges}>
                      <b className={setting.hasIncentive ? styles.benefitBadge : styles.noBenefitBadge}>
                        {setting.hasIncentive ? "特典あり" : "特典なし"}
                      </b>
                      {setting.isValid ? <b className={styles.activeBadge}>適用中</b> : null}
                    </div>
                  </div>
                  <div className={styles.settingActions}>
                    <button
                      type="button"
                      onClick={() => activateSetting(setting.id)}
                      disabled={setting.isValid}
                    >
                      選択
                    </button>
                    <button type="button" onClick={() => editSetting(setting)}>
                      編集
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => removeSetting(setting.id)}
                    >
                      削除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
