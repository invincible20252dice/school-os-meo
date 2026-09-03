export const DEFAULT_PROMPT_SETTING = {
  systemPrompt:
    "あなたは大学受験専門塾の校舎責任者です。保護者や生徒からのGoogle口コミに対して、感謝の気持ちを伝えつつ、安心感と温かみのある返信を作成してください。",
  tone: "丁寧・誠実・保護者目線",
  includeKeywords: "自習室, 個別指導, 大学受験, 逆転合格",
  ngKeywords: "絶対合格, 100%, 最低",
  targetLength: "150-250文字",
  autoReplyApproval: false,
} as const;

type PromptSettingSource = {
  id?: string | null;
  schoolId?: string | null;
  promptSystemRole?: string | null;
  systemPrompt?: string | null;
  promptReviewTone?: string | null;
  tone?: string | null;
  promptMustKeywords?: string[] | null;
  includeKeywords?: string | string[] | null;
  promptForbiddenWords?: string[] | null;
  ngKeywords?: string | string[] | null;
  promptTargetLength?: string | null;
  targetLength?: string | null;
  promptAutoReplyApproval?: boolean | null;
  autoReplyApproval?: boolean | null;
  updatedAt?: Date | string | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function splitKeywordText(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(normalizeString).filter(Boolean);
  }

  return normalizeString(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinKeywordList(value: unknown) {
  return splitKeywordText(value).join(", ");
}

function toUpdatedAt(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 16).replace("T", " ");
  }

  return normalizeString(value);
}

export function serializePromptSetting(
  schoolId: string,
  setting?: PromptSettingSource | null,
) {
  const includeKeywords =
    joinKeywordList(setting?.includeKeywords) ||
    joinKeywordList(setting?.promptMustKeywords) ||
    DEFAULT_PROMPT_SETTING.includeKeywords;
  const ngKeywords =
    joinKeywordList(setting?.ngKeywords) ||
    joinKeywordList(setting?.promptForbiddenWords) ||
    DEFAULT_PROMPT_SETTING.ngKeywords;
  const systemPrompt =
    normalizeString(setting?.systemPrompt) ||
    normalizeString(setting?.promptSystemRole) ||
    DEFAULT_PROMPT_SETTING.systemPrompt;
  const tone =
    normalizeString(setting?.tone) ||
    normalizeString(setting?.promptReviewTone) ||
    DEFAULT_PROMPT_SETTING.tone;
  const targetLength =
    normalizeString(setting?.targetLength) ||
    normalizeString(setting?.promptTargetLength) ||
    DEFAULT_PROMPT_SETTING.targetLength;
  const autoReplyApproval =
    setting?.autoReplyApproval ??
    setting?.promptAutoReplyApproval ??
    DEFAULT_PROMPT_SETTING.autoReplyApproval;

  return {
    id: normalizeString(setting?.id),
    schoolId,
    systemPrompt,
    tone,
    includeKeywords,
    ngKeywords,
    targetLength,
    autoReplyApproval,
    promptSystemRole: systemPrompt,
    promptReviewTone: tone,
    promptMustKeywords: splitKeywordText(includeKeywords),
    promptForbiddenWords: splitKeywordText(ngKeywords),
    promptTargetLength: targetLength,
    promptAutoReplyApproval: autoReplyApproval,
    updatedAt: toUpdatedAt(setting?.updatedAt),
  };
}

export function buildPromptSettingMutation(body: PromptSettingSource) {
  return {
    promptSystemRole:
      normalizeString(body.systemPrompt) ||
      normalizeString(body.promptSystemRole) ||
      DEFAULT_PROMPT_SETTING.systemPrompt,
    promptReviewTone:
      normalizeString(body.tone) ||
      normalizeString(body.promptReviewTone) ||
      DEFAULT_PROMPT_SETTING.tone,
    promptMustKeywords: splitKeywordText(
      body.includeKeywords ?? body.promptMustKeywords,
    ),
    promptForbiddenWords: splitKeywordText(
      body.ngKeywords ?? body.promptForbiddenWords,
    ),
    promptTargetLength:
      normalizeString(body.targetLength) ||
      normalizeString(body.promptTargetLength) ||
      DEFAULT_PROMPT_SETTING.targetLength,
    promptAutoReplyApproval: Boolean(
      body.autoReplyApproval ?? body.promptAutoReplyApproval,
    ),
  };
}

export function buildGbpReplySystemPrompt(setting?: PromptSettingSource | null) {
  const promptSetting = serializePromptSetting(
    normalizeString(setting?.schoolId),
    setting,
  );

  return `${promptSetting.systemPrompt}

【返信トーン】
${promptSetting.tone}

【必ず自然に含めたいキーワード】
${promptSetting.includeKeywords}

【使用しないNGワード】
${promptSetting.ngKeywords}

【文字数】
${promptSetting.targetLength}

【厳守事項】
1. Google口コミへの返信文を1案だけ作成してください。
2. 投稿者への感謝を自然に伝え、誇張や保証表現は避けてください。
3. NGワードは絶対に含めないでください。
4. 必須キーワードは不自然な羅列にせず、文脈に合う場合のみ自然に含めてください。`;
}
