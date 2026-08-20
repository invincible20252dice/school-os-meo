export type PromptReviewTone = "FRIENDLY" | "FORMAL" | "CASUAL";

export type SchoolSettingState = {
  id: string;
  schoolId: string;
  googleConnected: boolean;
  googleAccountId: string;
  googleRefreshToken: string;
  selectedGbpLocationId: string;
  googleReviewUrl: string;
  lineNotifyEnabled: boolean;
  lineChannelAccessToken: string;
  lineDestinationId: string;
  notifyOnNewReview: boolean;
  notifyOnLowRating: boolean;
  instagramConnected: boolean;
  instagramMetaAppId: string;
  instagramMetaAppSecret: string;
  instagramBusinessAccountId: string;
  instagramAccountName: string;
  instagramAccessToken: string;
  promptSystemRole: string;
  promptReviewTone: PromptReviewTone | string;
  promptForbiddenWords: string[];
  promptMustKeywords: string[];
  updatedAt: string;
};

export type NullableSchoolSettingState = {
  [K in keyof SchoolSettingState]?: SchoolSettingState[K] | null;
};

export function buildSettingsTabs() {
  return [
    {
      label: "Googleアカウント連携",
      href: "/dashboard/settings",
      key: "google",
    },
    {
      label: "LINE通知設定",
      href: "/dashboard/settings/line",
      key: "line",
    },
    {
      label: "Instagram連携設定",
      href: "/dashboard/settings/instagram",
      key: "instagram",
    },
    {
      label: "プロンプト設定",
      href: "/dashboard/settings/prompts",
      key: "prompts",
    },
  ];
}

export function buildMockSchoolSetting(): SchoolSettingState {
  return {
    id: "setting-demo-001",
    schoolId: "school-demo-001",
    googleConnected: true,
    googleAccountId: "owner@example.com",
    googleRefreshToken: "••••••••••••••••",
    selectedGbpLocationId: "locations/aoba-yokohama-main",
    googleReviewUrl:
      "https://search.google.com/local/writereview?placeid=ChIJyXGfWkGvQTUR0pD1oA7w0_0",
    lineNotifyEnabled: true,
    lineChannelAccessToken: "LINE_CHANNEL_TOKEN_********",
    lineDestinationId: "Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    notifyOnNewReview: true,
    notifyOnLowRating: true,
    instagramConnected: false,
    instagramMetaAppId: "123456789012345",
    instagramMetaAppSecret: "",
    instagramBusinessAccountId: "",
    instagramAccountName: "",
    instagramAccessToken: "",
    promptSystemRole:
      "あなたは学習塾の教室長として、保護者に安心感を与える自然で丁寧な文章を作成します。",
    promptReviewTone: "FRIENDLY",
    promptForbiddenWords: ["絶対合格", "成績保証", "必ず上がる"],
    promptMustKeywords: ["個別指導", "自習室", "定期テスト対策"],
    updatedAt: "2026-07-22 16:45",
  };
}

export function buildEmptySchoolSetting(schoolId: string): SchoolSettingState {
  return {
    id: "",
    schoolId: schoolId.trim(),
    googleConnected: false,
    googleAccountId: "",
    googleRefreshToken: "",
    selectedGbpLocationId: "",
    googleReviewUrl: "",
    lineNotifyEnabled: true,
    lineChannelAccessToken: "",
    lineDestinationId: "",
    notifyOnNewReview: true,
    notifyOnLowRating: true,
    instagramConnected: false,
    instagramMetaAppId: "",
    instagramMetaAppSecret: "",
    instagramBusinessAccountId: "",
    instagramAccountName: "",
    instagramAccessToken: "",
    promptSystemRole: "",
    promptReviewTone: "FRIENDLY",
    promptForbiddenWords: [],
    promptMustKeywords: [],
    updatedAt: "",
  };
}

function normalizeString(value: string | null | undefined) {
  return value ?? "";
}

function normalizeStringList(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function normalizeSchoolSetting(
  setting: NullableSchoolSettingState = {},
): SchoolSettingState {
  const fallback = buildEmptySchoolSetting(normalizeString(setting.schoolId));
  const hasInstagramAccount =
    Boolean(setting.instagramBusinessAccountId) ||
    Boolean(setting.instagramAccessToken) ||
    Boolean(setting.instagramAccountName);

  return {
    id: normalizeString(setting.id) || fallback.id,
    schoolId: normalizeString(setting.schoolId) || fallback.schoolId,
    googleConnected: setting.googleConnected ?? fallback.googleConnected,
    googleAccountId: normalizeString(setting.googleAccountId),
    googleRefreshToken: normalizeString(setting.googleRefreshToken),
    selectedGbpLocationId: normalizeString(setting.selectedGbpLocationId),
    googleReviewUrl: normalizeString(setting.googleReviewUrl),
    lineNotifyEnabled:
      setting.lineNotifyEnabled ?? fallback.lineNotifyEnabled,
    lineChannelAccessToken: normalizeString(setting.lineChannelAccessToken),
    lineDestinationId: normalizeString(setting.lineDestinationId),
    notifyOnNewReview:
      setting.notifyOnNewReview ?? fallback.notifyOnNewReview,
    notifyOnLowRating:
      setting.notifyOnLowRating ?? fallback.notifyOnLowRating,
    instagramConnected:
      setting.instagramConnected ?? hasInstagramAccount,
    instagramMetaAppId: normalizeString(setting.instagramMetaAppId),
    instagramMetaAppSecret: normalizeString(setting.instagramMetaAppSecret),
    instagramBusinessAccountId: normalizeString(
      setting.instagramBusinessAccountId,
    ),
    instagramAccountName: normalizeString(setting.instagramAccountName),
    instagramAccessToken: normalizeString(setting.instagramAccessToken),
    promptSystemRole: normalizeString(setting.promptSystemRole),
    promptReviewTone: setting.promptReviewTone ?? fallback.promptReviewTone,
    promptForbiddenWords: normalizeStringList(setting.promptForbiddenWords),
    promptMustKeywords: normalizeStringList(setting.promptMustKeywords),
    updatedAt: normalizeString(setting.updatedAt) || fallback.updatedAt,
  };
}

export function maskSecret(value: string) {
  if (!value.trim()) {
    return "未保存";
  }

  if (value.length <= 8) {
    return "********";
  }

  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function validateSchoolSetting(setting: SchoolSettingState) {
  const errors: string[] = [];

  if (setting.googleConnected && !setting.googleAccountId.trim()) {
    errors.push("Google連携時はGoogleアカウントIDを入力してください。");
  }

  if (setting.googleConnected && !setting.selectedGbpLocationId.trim()) {
    errors.push("Google連携時はGBP店舗IDを選択してください。");
  }

  if (setting.lineNotifyEnabled && !setting.lineChannelAccessToken.trim()) {
    errors.push("LINE通知有効時はチャネルアクセストークンを入力してください。");
  }

  if (setting.lineNotifyEnabled && !setting.lineDestinationId.trim()) {
    errors.push("LINE通知有効時は送信先IDを入力してください。");
  }

  if (setting.instagramConnected && !setting.instagramMetaAppId.trim()) {
    errors.push("Instagram連携時はMeta App IDを入力してください。");
  }

  if (setting.instagramConnected && !setting.instagramMetaAppSecret.trim()) {
    errors.push("Instagram連携時はMeta App Secretを入力してください。");
  }

  if (!["FRIENDLY", "FORMAL", "CASUAL"].includes(setting.promptReviewTone)) {
    errors.push(
      "返信トーンは FRIENDLY / FORMAL / CASUAL のいずれかを選択してください。",
    );
  }

  return errors;
}
