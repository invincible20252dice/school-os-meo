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

export function buildFallbackReviews(input: NormalizedReviewRequest) {
  const reasons = input.selectedReasons.length
    ? input.selectedReasons
    : fallbackReasons;
  const detail = input.freeText
    ? ` ${input.freeText}`
    : " 子どもの様子をよく見ながら声をかけてくれるので、家庭でも成長を感じています。";

  return [
    `${input.schoolName}に通い始めてから、学習への向き合い方が少しずつ前向きになりました。${reasons[0]}ところが特にありがたいです。${detail}`,
    `${input.schoolName}の先生方は子どもの理解度に合わせて丁寧に対応してくださるので、安心して通わせられています。${reasons.slice(0, 2).join("、")}点も良いと感じています。`,
    `${input.schoolName}は教室の雰囲気が落ち着いていて、質問しやすい環境だと思います。${reasons.join("、")}ので、これからも継続してお願いしたいです。`,
  ];
}

export function buildGoogleReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
