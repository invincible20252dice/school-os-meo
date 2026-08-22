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

export const REVIEW_GENERATION_TEMPERATURE = 0.88;
export const REVIEW_GENERATION_PRESENCE_PENALTY = 0.6;

export const REVIEW_GENERATION_SYSTEM_PROMPT = `
あなたは学習塾・予備校に通う生徒の保護者として、Googleマップに投稿する自然でリアルな口コミ体験談を執筆するプロライターです。

【最重要ルール】
1. 出力は「1つの口コミ文（パターン1）」のみ作成してください。複数案は不要です。
2. 固定テンプレート構文（「〜を考えて通い始めました」「〜変化を実感しています」など）に依存せず、生成ごとに文章構成や語り口を大きく変えてください。
   - 例A: 最初のエピソードから語る切り口
   - 例B: 先生の指導スタイルや安心感から語る切り口
   - 例C: お子さまの入塾前後の変化にフォーカスする切り口
3. アンケートの設問文や質問文自体は文章内に一切出力しないでください。
4. 選択肢の文言（例:「大学受験の専門対策をしたかった」「模試の成績・判定が伸び悩んでいた」）をそのままコピペ結合しないでください。自然な保護者の話し言葉にリライトしてください。
   - 悪い例: 「大学受験の専門対策をしたかったを考えて入塾しました」
   - 悪い例: 「模試の成績・判定が伸び悩んでいたも本人には合っていました」
   - 良い例: 「高校2年生になり、本格的な大学受験対策が必要だと感じて相談したのがきっかけです」
5. 選択肢やSEOキーワードを「、」で羅列するだけの表現は禁止です。
6. 学校名（例: 九州学院など）が入力されている場合は、「九州学院のカリキュラムや定期テスト対策にも詳しく…」のように文脈に自然に溶け込ませてください。
7. SEOキーワードが含まれている場合は、文章の自然さを損なわない範囲で文中に違和感なく1〜2箇所盛り込んでください。
8. 文字数は140〜240文字程度で、温かみと具体性のある日本語にしてください。
9. 「通塾のきっかけ: 大学受験対策」のようなラベル付き出力は禁止です。
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

const reviewAngles = [
  "入塾前に不安だった場面から書き始める",
  "先生へ相談した時の安心感から書き始める",
  "家庭での学習姿勢が変わった瞬間から書き始める",
  "学校名や定期テスト対策との相性から自然に語る",
  "費用面と指導内容の納得感を落ち着いた口調で語る",
  "受験に向けて親子で気持ちが切り替わった流れで語る",
];

export function pickReviewWritingAngle(randomValue = Math.random()) {
  const index = Math.min(
    reviewAngles.length - 1,
    Math.max(0, Math.floor(randomValue * reviewAngles.length)),
  );

  return reviewAngles[index];
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
【今回の語り口】: ${pickReviewWritingAngle()}

※出力フォーマット:
{"review": "完成した口コミ文本文"}
`;
}

function cleanChoiceLabel(value: string) {
  return value
    .replace(/[。.!！?？]+$/g, "")
    .replace(/をしたかった$/g, "")
    .replace(/したかった$/g, "")
    .replace(/を考えて$/g, "")
    .replace(/と感じた$/g, "")
    .replace(/が良かった$/g, "")
    .trim();
}

function asReasonNoun(value: string, fallback: string) {
  if (!value) {
    return fallback;
  }
  if (/[こと点]$/.test(value)) {
    return value;
  }

  return `${value}こと`;
}

function phraseTrigger(value: string) {
  const text = cleanChoiceLabel(value);

  if (text.includes("大学受験")) {
    return "大学受験に向けて、そろそろ本格的な対策が必要だと感じたこと";
  }
  if (text.includes("苦手")) {
    return "苦手科目を一つずつ立て直したかったこと";
  }
  if (text.includes("定期テスト")) {
    return "学校の定期テスト対策を丁寧に進めたかったこと";
  }
  if (text.includes("推薦")) {
    return "推薦入試も見据えて早めに準備したかったこと";
  }

  return asReasonNoun(text, "学習面をしっかり相談したかったこと");
}

function phraseGoodPoint(value: string) {
  const text = cleanChoiceLabel(value);

  if (text.includes("価格") || text.includes("料金") || text.includes("費用")) {
    return "費用面も納得しやすく続けやすい";
  }
  if (text.includes("質問")) {
    return "本人が質問しやすい雰囲気がある";
  }
  if (text.includes("説明") || text.includes("先生")) {
    return "先生の説明が具体的でわかりやすい";
  }
  if (text.includes("面談")) {
    return "面談で状況を丁寧に共有してもらえる";
  }
  if (text.includes("雰囲気") || text.includes("教室")) {
    return "教室の雰囲気が落ち着いていて通いやすい";
  }

  return text ? `${text}と感じられる` : "安心して相談できる";
}

function phraseGrowth(value: string) {
  const text = cleanChoiceLabel(value);

  if (text.includes("模試") || text.includes("判定") || text.includes("成績")) {
    return "模試の結果にも少しずつ手応えが出てきた";
  }
  if (text.includes("勉強量") || text.includes("学習習慣")) {
    return "家でも机に向かう時間が自然と増えてきた";
  }
  if (text.includes("自信")) {
    return "苦手だった単元にも前向きに取り組めるようになった";
  }
  if (text.includes("前向き")) {
    return "家でも自分から机に向かう時間が増えてきた";
  }

  return text ? `${text}ようになった` : "学習への向き合い方が前向きになった";
}

export function buildFallbackReview(input: NormalizedReviewRequest) {
  const reasons = input.selectedReasons.length
    ? input.selectedReasons
    : fallbackReasons;
  const grade = firstAnswerByQuestion(input, ["学年"], "高校生");
  const trigger = firstAnswerByQuestion(
    input,
    ["きっかけ", "通塾", "入塾"],
    "学習面をしっかり相談したかったこと",
  );
  const goodPoints = answersByQuestion(
    input,
    ["良かった", "感じた点", "良かった点"],
    reasons.slice(0, 2),
  );
  const changes = answersByQuestion(
    input,
    ["変化", "成績", "習慣"],
    reasons.slice(2, 5),
  );
  const support = phraseGoodPoint(goodPoints[0] || "先生が丁寧に見てくれる");
  const environment = phraseGoodPoint(goodPoints[1] || "質問しやすい雰囲気");
  const growth = phraseGrowth(changes[0] || "家庭でも自分から机に向かう時間が増えた");
  const triggerPhrase = phraseTrigger(trigger);
  const freeTextPhrase = input.freeText
    ? `${input.freeText}という本人の状況も踏まえて相談でき、`
    : "";
  const keywordPhrase = buildKeywordPhrase(input.keywords);

  return `${grade}の子どもが${input.schoolName}に通い始めたのは、${triggerPhrase}がきっかけでした。${freeTextPhrase}${support}ところに安心感があり、${environment}点も本人に合っていたようです。通ううちに${growth}ので、親としても相談してよかったと感じています。${keywordPhrase}`.trim();
}

export function buildFallbackReviews(input: NormalizedReviewRequest) {
  return [buildFallbackReview(input)];
}

export function buildGoogleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
