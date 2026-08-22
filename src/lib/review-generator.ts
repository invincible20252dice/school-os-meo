export type GenerateReviewRequest = {
  schoolName?: string;
  rating?: number;
  selectedReasons?: string[];
  freeText?: string;
  keywords?: string | string[];
  questionAnswers?: ReviewQuestionAnswer[];
};

export type NormalizedReviewRequest = {
  schoolName: string;
  rating: number;
  selectedReasons: string[];
  freeText?: string;
  keywords: string[];
  questionAnswers: ReviewQuestionAnswer[];
};

export type ReviewQuestionAnswer = {
  question?: string;
  type?: string;
  value?: string | string[];
};

const fallbackReasons = [
  "先生が丁寧に見てくれる",
  "教室の雰囲気が良い",
  "子どもが前向きに通えている",
];

export const REVIEW_GENERATION_SYSTEM_PROMPT = `
あなたは学習塾・予備校に通う生徒の保護者として、Googleマップに投稿する自然で高評価な口コミ文を1件執筆するプロライターです。

【執筆ルール】
1. 出力は「1つの口コミ文（パターン1）」のみ作成してください。複数案は不要です。
2. アンケートの設問文や質問文自体は文章内に一切出力しないでください。
3. ユーザーが選択した項目を、自然な文章の流れ・文脈としてストーリー仕立てで繋ぎ合わせてください。
4. 選択肢やSEOキーワードを「、」で羅列するだけの表現は禁止です。
5. SEOキーワードが含まれている場合は、文章の自然さを損なわない範囲で文中に違和感なく1〜2箇所盛り込んでください。
6. 自由記述や補足情報がある場合は、固有名詞や具体的な背景を自然な体験談として反映してください。
7. 指定文字数は150〜250文字程度の、読みやすく温かみのある日本語にしてください。
8. 「通塾のきっかけ: 大学受験対策」のようなラベル付き出力は禁止です。
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
  const keywords = normalizeList(body.keywords);
  const questionAnswers =
    body.questionAnswers
      ?.map((answer) => ({
        question: answer.question?.trim(),
        type: answer.type,
        value: Array.isArray(answer.value)
          ? answer.value.map((value) => value.trim()).filter(Boolean)
          : answer.value?.trim(),
      }))
      .filter((answer) => {
        const values = Array.isArray(answer.value)
          ? answer.value
          : answer.value
            ? [answer.value]
            : [];
        return values.length > 0;
      }) ?? [];

  return { schoolName, rating, selectedReasons, freeText, keywords, questionAnswers };
}

function normalizeList(value: string | string[] | undefined) {
  const values = Array.isArray(value)
    ? value
    : value
      ? value.split(/[,\n、]/)
      : [];

  return values.map((item) => item.trim()).filter(Boolean).slice(0, 6);
}

function answerValues(answer: ReviewQuestionAnswer) {
  if (Array.isArray(answer.value)) {
    return answer.value.map((value) => value.trim()).filter(Boolean);
  }

  return answer.value?.trim() ? [answer.value.trim()] : [];
}

function findAnswerByQuestion(input: NormalizedReviewRequest, keywords: string[]) {
  const answer = (input.questionAnswers ?? []).find((item) =>
    keywords.some((keyword) => item.question?.includes(keyword)),
  );

  return answer ? answerValues(answer) : [];
}

function firstAnswerByQuestion(
  input: NormalizedReviewRequest,
  keywords: string[],
  fallback: string,
) {
  return findAnswerByQuestion(input, keywords)[0] || fallback;
}

function answersByQuestion(
  input: NormalizedReviewRequest,
  keywords: string[],
  fallback: string[],
) {
  const values = findAnswerByQuestion(input, keywords);
  return values.length ? values : fallback;
}

function buildKeywordPhrase(keywords: string[]) {
  const safeKeywords = keywords ?? [];

  if (safeKeywords.length === 0) {
    return "";
  }

  return `地域で${safeKeywords.slice(0, 2).join("や")}を考えているご家庭にも合う塾だと感じます。`;
}

export function buildReviewPromptUserContent(input: NormalizedReviewRequest) {
  const grade = firstAnswerByQuestion(input, ["学年"], "高校生");
  const trigger = firstAnswerByQuestion(
    input,
    ["きっかけ", "通塾", "入塾"],
    "大学受験対策",
  );
  const goodPoints = answersByQuestion(
    input,
    ["良かった", "感じた点", "良かった点"],
    input.selectedReasons.slice(0, 3),
  );
  const changes = answersByQuestion(
    input,
    ["変化", "成績", "習慣"],
    input.selectedReasons.slice(2, 5),
  );

  return `
以下のアンケート選択結果をもとに、Google口コミ文を1つ作成してください。

【校舎名】: ${input.schoolName}
【学年】: ${grade}
【通塾のきっかけ】: ${trigger}
【良かったと感じた点】: ${goodPoints.join(", ") || "先生の説明, 質問しやすさ"}
【お子さんの変化】: ${changes.join(", ") || "模試の判定・順位が上がった, 勉強量が増えた"}
【自由記述・補足】: ${input.freeText || "なし"}
【含めたいキーワード】: ${input.keywords.join(", ") || "個別指導, 大学受験"}

※出力フォーマット:
{"review": "完成した口コミ文本文"}
`;
}

export function buildFallbackReview(input: NormalizedReviewRequest) {
  const reasons = input.selectedReasons.length
    ? input.selectedReasons
    : fallbackReasons;
  const grade = firstAnswerByQuestion(input, ["学年"], "高校生");
  const trigger = firstAnswerByQuestion(
    input,
    ["きっかけ", "通塾", "入塾"],
    reasons[0] || "大学受験対策",
  );
  const goodPoints = answersByQuestion(
    input,
    ["良かった", "感じた点", "良かった点"],
    reasons.slice(1, 3),
  );
  const changes = answersByQuestion(
    input,
    ["変化", "成績", "習慣"],
    reasons.slice(3, 5),
  );
  const support = goodPoints[0] || "先生が丁寧に見てくれる";
  const environment = goodPoints[1] || "質問しやすい雰囲気";
  const growth = changes[0] || "家庭でも自分から机に向かう時間が増えた";
  const freeTextPhrase = input.freeText
    ? `${input.freeText}という具体的な状況も踏まえて相談でき、`
    : "";
  const keywordPhrase = buildKeywordPhrase(input.keywords);

  return `${grade}の子どもの${trigger}を考えて${input.schoolName}に通い始めました。${freeTextPhrase}${support}ところが特に安心でき、${environment}も本人には合っていたようです。通ううちに${growth}と感じる場面が増え、親としても前向きな変化を実感しています。${keywordPhrase}`.trim();
}

export function buildFallbackReviews(input: NormalizedReviewRequest) {
  return [buildFallbackReview(input)];
}

export function buildGoogleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
