export type GenerateReviewRequest = {
  schoolName?: string;
  rating?: number;
  selectedReasons?: string[];
  freeText?: string;
};

export type NormalizedReviewRequest = {
  schoolName: string;
  rating: number;
  selectedReasons: string[];
  freeText?: string;
};

const fallbackReasons = [
  "先生が丁寧に見てくれる",
  "教室の雰囲気が良い",
  "子どもが前向きに通えている",
];

export const REVIEW_GENERATION_SYSTEM_PROMPT = `
あなたは学習塾・予備校の保護者または生徒本人として、Googleビジネスプロフィールに投稿する自然で説得力のある口コミ文を生成するプロのライターです。

【絶対遵守ルール】
1. アンケートの設問文や質問文自体は文章内に絶対に出力しないでください。
2. 選択されたキーワードを単語の羅列のまま貼り付けず、自然な会話文・感想文の文脈に溶け込ませてください。
3. 自由記述の具体的なエピソードや変化を主軸にし、保護者のリアルな感情や感謝が伝わるトーンで構成してください。
4. それぞれ切り口の異なる自然な3パターンを作成してください。
   - パターン1: 全体的な感謝と変化
   - パターン2: 先生の指導や対応の良さ
   - パターン3: 成績アップと学習習慣の定着
5. 各案は100〜300文字程度に収めてください。
6. 「通塾のきっかけを教えてください: 大学受験対策」のようなラベル付き出力は禁止です。
7. 「大学受験対策、価格、成績の変化が良かったです」のようなキーワード羅列は禁止です。
`;

export function normalizeReviewRequest(
  body: GenerateReviewRequest,
): NormalizedReviewRequest {
  const schoolName = body.schoolName?.trim() || "こちらの塾";
  const rating = Math.min(5, Math.max(1, Number(body.rating || 5)));
  const selectedReasons =
    body.selectedReasons
      ?.map((reason) => reason.trim())
      .filter(Boolean)
      .slice(0, 5) ?? fallbackReasons;
  const freeText = body.freeText?.trim() || undefined;

  return { schoolName, rating, selectedReasons, freeText };
}

function sentenceFromReason(reason: string | undefined, fallback: string) {
  return reason || fallback;
}

function buildContextPhrase(reasons: string[]) {
  const [first, second] = reasons;

  if (first && second) {
    return `${first}について相談したくて通い始めましたが、${second}の面でも安心して任せられています`;
  }

  if (first) {
    return `${first}について相談したくて通い始めました`;
  }

  return "学習面での不安を相談したくて通い始めました";
}

function buildSupportPhrase(reasons: string[]) {
  const [first, second] = reasons;

  if (first && second) {
    return `${first}ところに加えて、${second}についても丁寧に見ていただける`;
  }

  if (first) {
    return `${first}ところまで丁寧に見ていただける`;
  }

  return "子どもの理解度や性格に合わせて丁寧に見ていただける";
}

export function buildReviewPromptUserContent(input: NormalizedReviewRequest) {
  return JSON.stringify({
    schoolName: input.schoolName,
    rating: input.rating,
    selectedKeywords: input.selectedReasons,
    episode: input.freeText || "",
    output: {
      count: 3,
      format: "JSONのみ",
      note:
        "selectedKeywordsは参考情報です。設問文やラベルは出さず、自然な体験談として書いてください。",
    },
  });
}

export function buildFallbackReviews(input: NormalizedReviewRequest) {
  const reasons = input.selectedReasons.length
    ? input.selectedReasons
    : fallbackReasons;
  const detail = input.freeText
    ? input.freeText
    : "以前より家庭でも自分から机に向かう時間が増え、少しずつ自信がついてきたように感じます。";
  const context = buildContextPhrase(reasons);
  const support = buildSupportPhrase(reasons);
  const growth = sentenceFromReason(
    reasons.find((reason) => reason.includes("成績") || reason.includes("習慣")),
    "日々の学習習慣",
  );

  return [
    `${input.schoolName}には、${context}。通い始めてから学習への向き合い方が前向きになり、${detail}親としても安心して見守れるようになりました。`,
    `${input.schoolName}の先生方は、${support}のでありがたいです。質問しやすい雰囲気があり、本人も不安をため込まずに取り組めています。`,
    `${input.schoolName}に通うようになって、${growth}が少しずつ定着してきました。苦手な単元にも逃げずに向き合う姿が増え、今後の伸びにも期待しています。`,
  ];
}

export function buildGoogleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
