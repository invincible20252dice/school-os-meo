export type SurveyItemType = "SINGLE_SELECT" | "MULTI_SELECT" | "TEXT";
export type SurveyWeekday = "月" | "火" | "水" | "木" | "金" | "土" | "日";

export type SurveyEditorItem = {
  id: string;
  type: SurveyItemType;
  question: string;
  placeholder?: string;
  maxSelect?: number;
  options: string[];
  order: number;
};

export type SurveyEditorState = {
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
  activeWeekdays: SurveyWeekday[];
  items: SurveyEditorItem[];
};

export type SurveySettingListItem = SurveyEditorState & {
  createdAt: string;
  updatedAt: string;
};

export function buildMockSurveyEditorState(): SurveyEditorState {
  return {
    id: "survey-demo-001",
    schoolId: "school-demo-001",
    title: "202501 口コミ促進アンケート",
    requiredKeywords: "横浜駅, 個別指導, 定期テスト, 学習習慣",
    minCharCount: 100,
    maxCharCount: 300,
    isValid: true,
    hasIncentive: true,
    benefitType: "体験授業クーポン",
    benefitShowTiming: "Google口コミ投稿後",
    activeWeekdays: ["月", "火", "水", "木", "金"],
    items: [
      {
        id: "item-001",
        type: "SINGLE_SELECT",
        question: "通塾のきっかけを教えてください",
        options: ["定期テスト対策", "受験対策", "苦手科目の克服", "学習習慣づくり"],
        order: 1,
      },
      {
        id: "item-002",
        type: "MULTI_SELECT",
        question: "良かったと感じた点を選んでください",
        maxSelect: 3,
        options: ["先生の説明", "質問しやすさ", "面談の丁寧さ", "教室の雰囲気", "成績の変化"],
        order: 2,
      },
      {
        id: "item-003",
        type: "TEXT",
        question: "お子さまの変化や印象に残っていることを教えてください",
        placeholder: "例: 苦手だった数学に自信がつき、家でも自分から机に向かうようになりました。",
        options: [],
        order: 3,
      },
      {
        id: "item-004",
        type: "SINGLE_SELECT",
        question: "口コミに入れてもよい学年を選んでください",
        options: ["小学生", "中学生", "高校生", "記載しない"],
        order: 4,
      },
    ],
  };
}

export function buildMockSurveySettingList(): SurveySettingListItem[] {
  const base = buildMockSurveyEditorState();

  return [
    {
      ...base,
      createdAt: "2026-07-01 10:20",
      updatedAt: "2026-07-22 16:45",
    },
    {
      ...base,
      id: "survey-demo-002",
      title: "夏期講習 受講後アンケート",
      requiredKeywords: "夏期講習, 個別指導, 苦手克服",
      isValid: false,
      hasIncentive: false,
      benefitType: "",
      benefitShowTiming: "",
      activeWeekdays: ["月", "水", "金"],
      items: base.items.slice(0, 3).map((item, index) => ({
        ...item,
        id: `summer-${index + 1}`,
        order: index + 1,
      })),
      createdAt: "2026-07-10 09:00",
      updatedAt: "2026-07-18 13:30",
    },
  ];
}

function normalizeIncentive(survey: SurveyEditorState): SurveyEditorState {
  if (survey.hasIncentive) {
    return survey;
  }

  return {
    ...survey,
    benefitType: "",
    benefitShowTiming: "",
  };
}

export function normalizeSurveyItemOrder(
  items: SurveyEditorItem[],
): SurveyEditorItem[] {
  return items.map((item, index) => ({
    ...item,
    order: index + 1,
  }));
}

export function moveSurveyItem(
  items: SurveyEditorItem[],
  itemId: string,
  direction: "up" | "down",
): SurveyEditorItem[] {
  const currentIndex = items.findIndex((item) => item.id === itemId);

  if (currentIndex < 0) {
    return normalizeSurveyItemOrder(items);
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= items.length) {
    return normalizeSurveyItemOrder(items);
  }

  const nextItems = [...items];
  const currentItem = nextItems[currentIndex];
  nextItems[currentIndex] = nextItems[targetIndex];
  nextItems[targetIndex] = currentItem;

  return normalizeSurveyItemOrder(nextItems);
}

export function validateSurveyEditorState(survey: SurveyEditorState) {
  const errors: string[] = [];

  if (!survey.title.trim()) {
    errors.push("アンケート名を入力してください。");
  }

  if (survey.minCharCount > survey.maxCharCount) {
    errors.push("最小文字数は最大文字数以下にしてください。");
  }

  if (survey.activeWeekdays.length === 0) {
    errors.push("公開する曜日を1つ以上選択してください。");
  }

  survey.items.forEach((item, index) => {
    if (!item.question.trim()) {
      errors.push(`${index + 1}番目の設問文を入力してください。`);
    }

    if (item.type !== "TEXT" && item.options.length === 0) {
      errors.push(`${index + 1}番目の選択肢を1つ以上入力してください。`);
    }
  });

  return errors;
}

export function saveSurveySetting(
  settings: SurveySettingListItem[],
  survey: SurveyEditorState,
  now: string,
): SurveySettingListItem[] {
  const normalizedSurvey = normalizeIncentive({
    ...survey,
    items: normalizeSurveyItemOrder(survey.items),
  });
  const existing = settings.find((setting) => setting.id === survey.id);

  if (existing) {
    return settings.map((setting) =>
      setting.id === survey.id
        ? {
            ...normalizedSurvey,
            createdAt: setting.createdAt,
            updatedAt: now,
          }
        : setting,
    );
  }

  return [
    {
      ...normalizedSurvey,
      createdAt: now,
      updatedAt: now,
    },
    ...settings,
  ];
}

export function activateSurveySetting(
  settings: SurveySettingListItem[],
  surveyId: string,
): SurveySettingListItem[] {
  return settings.map((setting) => ({
    ...setting,
    isValid: setting.id === surveyId,
  }));
}

export function deleteSurveySetting(
  settings: SurveySettingListItem[],
  surveyId: string,
): {
  settings: SurveySettingListItem[];
  blockedReason: string | null;
} {
  const target = settings.find((setting) => setting.id === surveyId);

  if (!target) {
    return { settings, blockedReason: null };
  }

  if (target.isValid) {
    return {
      settings,
      blockedReason: "適用中のアンケートは削除できません。先に別のアンケートを選択してください。",
    };
  }

  return {
    settings: settings.filter((setting) => setting.id !== surveyId),
    blockedReason: null,
  };
}

function includesAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getTextQuestionPlaceholder(question: string, customPlaceholder?: string) {
  const placeholder = customPlaceholder?.trim();

  if (placeholder) {
    return placeholder;
  }

  if (includesAnyKeyword(question, ["高校", "学校", "どこ", "校名"])) {
    return "例: 熊本高校、済々黌高校、第一高校 など";
  }

  if (includesAnyKeyword(question, ["変化", "印象", "成長", "様子"])) {
    return "例: 苦手だった数学に自信がつき、家でも自分から机に向かうようになりました。";
  }

  if (includesAnyKeyword(question, ["理由", "きっかけ", "目的"])) {
    return "例: 大学受験に向けて苦手科目を個別でじっくり対策したかったため。";
  }

  return "ご自由に入力してください";
}

export function getTextQuestionHelperText(
  question: string,
  minCharCount: number,
  maxCharCount: number,
) {
  if (includesAnyKeyword(question, ["高校", "学校", "どこ", "校名"])) {
    return "学校名を入力してください";
  }

  return `${minCharCount}〜${maxCharCount}文字を目安に入力`;
}

export function buildSurveyPreviewSteps(survey: SurveyEditorState) {
  return normalizeSurveyItemOrder(survey.items)
    .map((item) => ({
      ...item,
      placeholder:
        item.type === "TEXT"
          ? getTextQuestionPlaceholder(item.question, item.placeholder)
          : undefined,
      helperText:
        item.type === "MULTI_SELECT" && item.maxSelect
          ? `最大${item.maxSelect}つまで選択できます`
          : item.type === "TEXT"
            ? getTextQuestionHelperText(
                item.question,
                survey.minCharCount,
                survey.maxCharCount,
              )
            : "1つ選択してください",
    }));
}
