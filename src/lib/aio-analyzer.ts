type Sentiment = "positive" | "neutral" | "negative";

export type ScoreAiResponseInput = {
  responseText: string;
  ownSchoolName: string;
  competitorNames?: string[];
};

export type AioVisibilityInput = {
  ownSchoolName: string;
  keyword: string;
  nearestStation: string;
  municipality: string;
  competitorNames?: string[];
  engines?: {
    chatgpt?: string;
    gemini?: string;
    googleAi?: string;
  };
};

const positiveWords = [
  "おすすめ",
  "推奨",
  "評価",
  "実績",
  "丁寧",
  "安心",
  "人気",
  "豊富",
  "向いています",
];

const negativeWords = ["ただし", "一方", "課題", "少ない", "不明", "注意"];

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

export function buildAioPrompt({
  keyword,
  nearestStation,
  municipality,
}: {
  keyword: string;
  nearestStation: string;
  municipality: string;
}) {
  return `${municipality}の${nearestStation}周辺で「${keyword}」を探している保護者に、おすすめの学習塾を理由付きで教えてください。`;
}

export function scoreAiResponse({
  responseText,
  ownSchoolName,
  competitorNames = [],
}: ScoreAiResponseInput) {
  const mentioned = responseText.includes(ownSchoolName);
  const mentionedCompetitors = competitorNames.filter((name) =>
    responseText.includes(name),
  );

  if (!mentioned) {
    return {
      score: 0,
      mentioned,
      sentiment: "neutral" as Sentiment,
      mentionedCompetitors,
      reasons: ["自校舎名がAI回答内に表示されていません"],
    };
  }

  const positive = includesAny(responseText, positiveWords);
  const negative = includesAny(responseText, negativeWords);
  const competitorPenalty = Math.min(20, mentionedCompetitors.length * 10);
  const base = positive ? 100 : 65;
  const score = positive
    ? clampScore(base - (negative ? 25 : 0) - competitorPenalty)
    : 55;
  const sentiment: Sentiment = positive && !negative ? "positive" : "neutral";
  const reasons = [
    "自校舎名が明示されています",
    ...(positive ? ["おすすめ・実績・口コミなど肯定的な文脈があります"] : []),
    ...(mentionedCompetitors.length
      ? ["競合校も同じ回答内で比較対象として言及されています"]
      : []),
    ...(negative ? ["注意・比較・弱い表現が含まれています"] : []),
  ];

  return {
    score,
    mentioned,
    sentiment,
    mentionedCompetitors,
    reasons,
  };
}

function defaultEngineResponses(input: AioVisibilityInput) {
  return {
    chatgpt: `${input.nearestStation}周辺では${input.ownSchoolName}がおすすめです。個別指導の実績があり、口コミでも丁寧な対応が評価されています。`,
    gemini: `${input.nearestStation}周辺では${input.competitorNames?.[0] ?? "駅前の大手塾"}がよく知られています。`,
    googleAi: `${input.ownSchoolName}も候補の一つです。ただし最新情報や合格エピソードを比較して検討するとよいでしょう。`,
  };
}

export async function analyzeAioVisibility(input: AioVisibilityInput) {
  const responses = {
    ...defaultEngineResponses(input),
    ...input.engines,
  };
  const chatgpt = scoreAiResponse({
    responseText: responses.chatgpt,
    ownSchoolName: input.ownSchoolName,
    competitorNames: input.competitorNames,
  });
  const gemini = scoreAiResponse({
    responseText: responses.gemini,
    ownSchoolName: input.ownSchoolName,
    competitorNames: input.competitorNames,
  });
  const googleAi = scoreAiResponse({
    responseText: responses.googleAi,
    ownSchoolName: input.ownSchoolName,
    competitorNames: input.competitorNames,
  });
  const totalScore = clampScore(
    (chatgpt.score + gemini.score + googleAi.score) / 3,
  );

  return {
    chatgptScore: chatgpt.score,
    geminiScore: gemini.score,
    googleAiScore: googleAi.score,
    totalScore,
    aiMentions: {
      prompt: buildAioPrompt(input),
      chatgpt,
      gemini,
      googleAi,
      responses,
    },
  };
}

export function buildMockAioScoreDashboard() {
  const summary = {
    chatgptScore: 100,
    geminiScore: 0,
    googleAiScore: 40,
    totalScore: 47,
  };
  const keywordRows = [
    {
      keyword: "横浜駅 個別指導 塾",
      chatgptScore: 100,
      geminiScore: 0,
      googleAiScore: 40,
      totalScore: 47,
      status: "要改善",
    },
    {
      keyword: "横浜市西区 学習塾",
      chatgptScore: 80,
      geminiScore: 20,
      googleAiScore: 55,
      totalScore: 52,
      status: "伸長中",
    },
    {
      keyword: "横浜駅 中学生 個別指導",
      chatgptScore: 65,
      geminiScore: 0,
      googleAiScore: 35,
      totalScore: 33,
      status: "未露出",
    },
  ];
  const actions = [
    "Geminiでの表示率を上げるため、Googleマップの最新情報とサービス説明を更新してください。",
    "AIから「実績が豊富」と評価されるよう、口コミで合格エピソードや成績改善エピソードを増やしましょう。",
    "InstagramとGBP投稿を継続し、直近の教室活動や講習情報の更新頻度を上げてください。",
    "最寄り駅・市町村名を含む校舎紹介文を整備し、AIが地域性を判断しやすい状態にしてください。",
  ];

  return {
    schoolName: "青葉ゼミナール 本校",
    checkedAt: "2026-07-22 09:00",
    summary,
    keywordRows,
    actions,
    mentions: {
      chatgpt:
        "青葉ゼミナール 本校は横浜駅周辺の個別指導塾として、丁寧な指導と口コミ評価が確認できます。",
      gemini:
        "横浜駅周辺では大手個別指導塾が複数候補に挙がります。青葉ゼミナール 本校は未言及です。",
      googleAi:
        "青葉ゼミナール 本校も候補ですが、最新の合格実績や講習情報の補足があると比較されやすくなります。",
    },
  };
}
