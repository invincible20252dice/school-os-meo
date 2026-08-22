export type PublicSurveyQuestionType =
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "TEXT"
  | string;

export type PublicSurveyQuestion = {
  id: string;
  type: PublicSurveyQuestionType;
  question: string;
  placeholder?: string;
  maxSelect?: number | null;
  options: string[];
  order: number;
};

export type PublicSurveyAnswerValue = string | string[];

export type PublicSurveyAnswerState = Record<string, PublicSurveyAnswerValue>;

export type PublicSurveyQuestionAnswer = {
  questionId: string;
  question: string;
  type: PublicSurveyQuestionType;
  value: PublicSurveyAnswerValue;
};

function isTextQuestion(type: PublicSurveyQuestionType) {
  const normalized = String(type).trim().toLowerCase();

  return (
    normalized === "text" ||
    normalized === "textarea" ||
    normalized === "free" ||
    normalized === "free_text" ||
    String(type).trim() === "自由記述"
  );
}

export function createInitialPublicSurveyAnswers(
  questions: PublicSurveyQuestion[],
): PublicSurveyAnswerState {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      question.type === "MULTI_SELECT" ? [] : "",
    ]),
  );
}

export function getAnswerValues(
  answers: PublicSurveyAnswerState,
  questionId: string,
) {
  const value = answers[questionId];

  return Array.isArray(value) ? value : value ? [value] : [];
}

export function setSingleSurveyAnswer(
  answers: PublicSurveyAnswerState,
  questionId: string,
  option: string,
): PublicSurveyAnswerState {
  return {
    ...answers,
    [questionId]: option,
  };
}

export function setTextSurveyAnswer(
  answers: PublicSurveyAnswerState,
  questionId: string,
  value: string,
): PublicSurveyAnswerState {
  return {
    ...answers,
    [questionId]: value,
  };
}

export function toggleMultiSurveyAnswer(
  answers: PublicSurveyAnswerState,
  question: Pick<PublicSurveyQuestion, "id" | "maxSelect">,
  option: string,
): PublicSurveyAnswerState {
  const current = getAnswerValues(answers, question.id);

  if (current.includes(option)) {
    return {
      ...answers,
      [question.id]: current.filter((item) => item !== option),
    };
  }

  const maxSelect = question.maxSelect && question.maxSelect > 0 ? question.maxSelect : 0;

  if (maxSelect && current.length >= maxSelect) {
    return answers;
  }

  return {
    ...answers,
    [question.id]: [...current, option],
  };
}

export function buildPublicSurveyQuestionAnswers(
  questions: PublicSurveyQuestion[],
  answers: PublicSurveyAnswerState,
): PublicSurveyQuestionAnswer[] {
  return questions.map((question) => ({
    questionId: question.id,
    question: question.question,
    type: question.type,
    value: answers[question.id] ?? (question.type === "MULTI_SELECT" ? [] : ""),
  }));
}

export function buildReviewGenerationInputFromSurveyAnswers({
  questions,
  answers,
}: {
  questions: PublicSurveyQuestion[];
  answers: PublicSurveyAnswerState;
}) {
  const questionAnswers = buildPublicSurveyQuestionAnswers(questions, answers).filter(
    (answer) => getAnswerValues(answers, answer.questionId).length > 0,
  );
  const choiceAnswers = questionAnswers.filter(
    (answer) => !isTextQuestion(answer.type),
  );
  const textAnswers = questionAnswers.filter((answer) => isTextQuestion(answer.type));
  const selectedReasons = choiceAnswers
    .flatMap((answer) => (Array.isArray(answer.value) ? answer.value : [answer.value]))
    .map((value) => value.trim())
    .filter(Boolean);
  const freeText = textAnswers
    .flatMap((answer) => (Array.isArray(answer.value) ? answer.value : [answer.value]))
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");

  return {
    selectedReasons,
    freeText,
    questionAnswers,
  };
}
