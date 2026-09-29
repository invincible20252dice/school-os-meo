import type { NormalizedReviewRequest } from "./review-generator";

// Exact choice matches avoid turning arbitrary clauses or negative answers into praise.
const choiceSentences: Record<string, string> = {
  大学受験対策: "大学受験の対策を目的に通い始めました。",
  大学受験の専門対策をしたかった: "大学受験の専門的な対策をしたいと思い、通い始めました。",
  苦手科目の克服: "苦手科目を克服したいと思い、通い始めました。",
  学習習慣づくり: "学習習慣を身につけたいと思い、通い始めました。",
  推薦入試対策: "推薦入試の対策を目的に通い始めました。",
  "模試の成績・判定が伸び悩んでいた": "入塾前は、模試の成績や判定が伸び悩んでいました。",
  先生の説明: "先生の説明が良かったと感じています。",
  質問しやすさ: "質問しやすいところが良いと感じています。",
  質問しやすい: "質問しやすいと感じています。",
  先生への質問のしやすさ: "先生に質問しやすいことが、塾を選んだ決め手でした。",
  面談の丁寧さ: "面談が丁寧だと感じています。",
  教室の雰囲気: "教室の雰囲気が良いと感じています。",
  価格: "価格の面が良いと感じています。",
  成績の変化: "成績に良い変化を感じています。",
  "模試の判定・順位が上がった": "通い始めてから、模試の判定や順位が上がりました。",
  自習室が静かで集中できる: "自習室は静かで、集中して勉強できる環境です。",
  わかりやすい個別指導: "個別指導がわかりやすいと感じています。",
  苦手単元を根本から克服できる: "苦手な単元を根本から克服できる指導だと感じています。",
  勉強法や計画まで細かく教えてくれる: "勉強の方法や計画まで細かく教えてもらえます。",
  下通りで通塾が便利: "下通りにあり、通塾に便利です。",
};

function sentence(text: string) {
  return /[。！？!?]$/.test(text) ? text : `${text}。`;
}

export function buildAnswerBasedReview(input: NormalizedReviewRequest): string {
  const isStudent = input.respondentType === "STUDENT";
  const subject = isStudent ? "私" : "子ども";
  const context: string[] = [];
  const body: string[] = [];
  const seen = new Set<string>();

  function add(value: string, question: string, type: string) {
    if (seen.has(value)) return;
    seen.add(value);
    if (/学年/.test(question)) {
      if (value !== "記載しない") context.push(`${subject}は${value}です。`);
      return;
    }
    if (/(高校|学校|校名|在籍校).*(どこ|教え|名前|名称)|^(高校名|学校名|在籍校)$/.test(question)) {
      if (value !== "記載しない") context.push(`${subject}は${value}に通っています。`);
      return;
    }
    if (/^(text|textarea|free|free_text|自由記述)$/i.test(type)) {
      body.push(sentence(value));
      return;
    }
    if (/不満|悪かった|困って|改善して|不安/.test(question)) {
      body.push(`気になっているのは「${value}」です。`);
      return;
    }
    if (value === "自分に合ったペースで進められる") {
      body.push(`${subject}に合ったペースで学習を進められます。`);
      return;
    }
    if (value === "自ら机に向かう習慣がついた") {
      body.push(`${subject}が自ら机に向かう習慣がつきました。`);
      return;
    }
    if (value === "安心して子供を任せられる塾です" && isStudent) return;
    const known = Object.hasOwn(choiceSentences, value) ? choiceSentences[value] : undefined;
    if (known) {
      body.push(known);
    } else if (/きっかけ|理由|目的|入塾前/.test(question)) {
      body.push(`通塾のきっかけは「${value}」です。`);
    } else {
      body.push(`通塾については「${value}」と感じています。`);
    }
  }

  // Structured answers retain the question context. Summary fields duplicate these answers.
  if (input.questionAnswers.length) {
    for (const answer of input.questionAnswers) {
      const values = Array.isArray(answer.value) ? answer.value : [answer.value];
      for (const value of values) {
        if (value?.trim()) add(value.trim(), answer.question ?? "", answer.type ?? "");
      }
    }
  } else {
    for (const value of input.selectedReasons) add(value, "", "MULTI_SELECT");
    if (input.freeText) add(input.freeText, "", "TEXT");
  }
  if (!context.length && !body.length) return "";
  const intro = input.schoolName
    ? `${isStudent ? "私" : "子ども"}が${input.schoolName}で学んでいます。`
    : "";
  return [intro, ...context, ...body].join("");
}
