import type { NormalizedReviewRequest } from "./review-generator";

type Group = "purpose" | "problem" | "support" | "change" | "environment" | "closing";
type Fact = { group: Group; choices: string[]; text: string; parentText?: string; parentOnly?: true };

// Exact semantic aliases, not substring matches: "質問しにくい" must never imply praise.
const facts: Fact[] = [
  { group: "purpose", choices: ["大学受験対策", "大学受験の専門対策をしたかった"], text: "大学受験の対策" },
  { group: "purpose", choices: ["苦手科目の克服"], text: "苦手科目の克服" },
  { group: "purpose", choices: ["学習習慣づくり", "学習習慣づけ"], text: "学習習慣の定着" },
  { group: "purpose", choices: ["推薦入試対策", "推薦・総合型選抜の対策が必要だった"], text: "推薦入試などの選抜対策" },
  { group: "problem", choices: ["何から勉強していいかわからない"], text: "何から勉強を始めればよいかわからないこと" },
  { group: "problem", choices: ["志望校への合格方法が分からなかった"], text: "志望校に向けた勉強の進め方がわからないこと" },
  { group: "problem", choices: ["模試の成績・判定が伸び悩んでいた"], text: "模試の成績や判定が伸び悩んでいたこと" },
  { group: "problem", choices: ["学校や集団授業についていけない"], text: "学校や集団授業についていけないこと" },
  { group: "support", choices: ["先生の説明"], text: "先生の説明" },
  { group: "support", choices: ["わかりやすい個別指導"], text: "わかりやすい個別指導" },
  { group: "support", choices: ["質問しやすさ", "質問しやすい", "先生への質問のしやすさ"], text: "先生への質問のしやすさ" },
  { group: "support", choices: ["先生にいつでも質問・相談しやすい"], text: "先生にいつでも質問や相談ができること" },
  { group: "support", choices: ["面談の丁寧さ", "丁寧な学習相談・面談"], text: "学習相談や面談の丁寧さ" },
  { group: "support", choices: ["定期的な面談で進捗がわかり安心"], text: "定期的な面談で進捗がわかる安心感" },
  { group: "support", choices: ["自分に合ったペースで進められる"], text: "自分に合った学習ペース", parentText: "子どもに合った学習ペース" },
  { group: "support", choices: ["個別カリキュラムを組んでくれる"], text: "個別に組んでもらえるカリキュラム" },
  { group: "support", choices: ["学習計画を立ててもらえる"], text: "学習計画を立ててもらえること" },
  { group: "support", choices: ["やることが明確になった"], text: "やるべきことが明確になったこと" },
  { group: "support", choices: ["勉強法や計画まで細かく教えてくれる"], text: "勉強法や計画まで細かく教えてもらえること" },
  { group: "support", choices: ["苦手単元を根本から克服できる"], text: "苦手単元を根本から克服できる指導" },
  { group: "support", choices: ["モチベーションを引き出してくれる"], text: "学習意欲を引き出してくれる対応" },
  { group: "support", choices: ["価格", "安心できる価格設定"], text: "価格面での安心感" },
  { group: "change", choices: ["成績の変化"], text: "成績の良い変化" },
  { group: "change", choices: ["模試の判定・順位が上がった"], text: "模試の判定や順位の向上" },
  { group: "change", choices: ["勉強時間が圧倒的に増えた", "勉強時間が増えた"], text: "勉強時間の増加" },
  { group: "change", choices: ["自ら机に向かう習慣がついた"], text: "自分から机に向かう習慣の定着", parentText: "子どもが自ら机に向かう習慣の定着" },
  { group: "change", choices: ["苦手科目に自信がついた"], text: "苦手科目への自信" },
  { group: "change", choices: ["志望校合格への道筋が見えた"], text: "志望校に向けた道筋が見えたこと" },
  { group: "environment", choices: ["教室の雰囲気"], text: "教室の雰囲気" },
  { group: "environment", choices: ["自習室が静かで集中できる"], text: "静かで集中しやすい自習室" },
  { group: "environment", choices: ["下通りで通塾が便利", "通いやすい立地（下通り・街中）"], text: "下通りの通いやすい立地" },
  { group: "closing", choices: ["受験本番まで引き続きお願いしたいです"], text: "受験本番まで引き続きお世話になりたいです。" },
  { group: "closing", choices: ["志望校合格に向けて頑張りたい"], text: "志望校合格に向けて頑張りたいと思います。", parentText: "子どもの志望校合格に向けて支えていきたいと思います。" },
  { group: "closing", choices: ["安心して子供を任せられる塾です"], text: "安心して子どもを任せられる塾だと感じています。", parentOnly: true },
  { group: "closing", choices: ["もっと早く通わせればよかったです"], text: "もっと早く通わせればよかったと思います。", parentOnly: true },
  { group: "closing", choices: ["個別指導でじっくり伸ばしたい方におすすめです"], text: "個別指導でじっくり学びたい方におすすめしたいです。" },
];

function list(values: string[]) {
  if (values.length < 2) return values.join("");
  return `${values.slice(0, -1).join("、")}と${values.at(-1)}`;
}

function finish(text: string) {
  return /[。！？!?]$/.test(text) ? text : `${text}。`;
}

function introduction(student: boolean, schoolName: string, highSchool: string, grade: string) {
  const studentContext = highSchool ? `${highSchool}に通${grade ? `う${grade}` : "っています"}` : grade;
  const childContext = highSchool ? `${highSchool}に通う${grade ? `${grade}の` : ""}子ども` : `${grade ? `${grade}の` : ""}子ども`;
  if (schoolName) {
    if (!student) return `${childContext}が${schoolName}に通っています。`;
    if (highSchool && !grade) return `${highSchool}に通っており、${schoolName}で学んでいます。`;
    return studentContext ? `${studentContext}で、${schoolName}で学んでいます。` : `${schoolName}に通っています。`;
  }
  if (!highSchool && !grade) return "";
  if (!student) return `${childContext}の保護者です。`;
  return highSchool && !grade ? `${studentContext}。` : `${studentContext}です。`;
}

export function buildAnswerBasedReview(input: NormalizedReviewRequest): string {
  const student = input.respondentType === "STUDENT";
  const groups: Record<Group, Set<string>> = {
    purpose: new Set(), problem: new Set(), support: new Set(),
    change: new Set(), environment: new Set(), closing: new Set(),
  };
  let grade = "";
  let highSchool = "";
  const free = new Set<string>();
  const concerns = new Set<string>();
  const other = new Set<string>();
  const otherReasons = new Set<string>();

  function collect(value: string, question: string, type: string) {
    if (value === "記載しない") return;
    if (/学年/.test(question)) { grade = value; return; }
    if (/(高校|学校|校名|在籍校).*(どこ|教え|名前|名称)|^(高校名|学校名|在籍校)$/.test(question)) { highSchool = value; return; }
    if (/^(text|textarea|free|free_text|自由記述)$/i.test(type)) { free.add(finish(value)); return; }
    if (/不満|悪かった|困って|改善して|不安/.test(question)) { concerns.add(value); return; }
    const fact = facts.find(item => item.choices.includes(value));
    if (fact) {
      if (fact.parentOnly && student) return;
      groups[fact.group].add(!student && fact.parentText ? fact.parentText : fact.text);
    } else if (/きっかけ|理由|目的|入塾前/.test(question)) {
      otherReasons.add(value);
    } else {
      other.add(value);
    }
  }

  // Collect facts first; prose is composed once per topic, never once per choice.
  if (input.questionAnswers.length) {
    for (const answer of input.questionAnswers) {
      const values = Array.isArray(answer.value) ? answer.value : [answer.value];
      for (const value of values) if (value?.trim()) collect(value.trim(), answer.question ?? "", answer.type ?? "");
    }
  } else {
    for (const value of input.selectedReasons) collect(value, "", "MULTI_SELECT");
    if (input.freeText) collect(input.freeText, "", "TEXT");
  }

  const purpose = list([...groups.purpose]);
  const problem = list([...groups.problem]);
  const support = list([...groups.support]);
  const change = list([...groups.change]);
  const environment = list([...groups.environment]);
  const quoted = (values: Set<string>) => list([...values].map(value => `「${value}」`));
  const background = [
    problem && `入塾前は、${problem}が悩みでした。`,
    purpose && `${purpose}を目的に、通塾を決めました。`,
    otherReasons.size && `${quoted(otherReasons)}というきっかけもありました。`,
  ].filter(Boolean).join("");
  const experience = [
    support && `${support}が、通う中で良いと感じる点です。`,
    change && `通塾後は、${change}という変化${support ? "も" : "が"}ありました。`,
    concerns.size && `一方で、${quoted(concerns)}という点は気になっています。`,
    other.size && `${quoted(other)}という点も印象に残っています。`,
  ].filter(Boolean).join("");
  const closing = [environment && `${environment}も魅力です。`, ...groups.closing, ...free].filter(Boolean).join("");
  if (!highSchool && !grade && !background && !experience && !closing) return "";
  return [introduction(student, input.schoolName, highSchool, grade), background, experience, closing].filter(Boolean).join("\n\n");
}
