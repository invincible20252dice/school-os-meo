import { NextResponse } from "next/server";
import {
  buildFallbackReviews,
  buildReviewPromptUserContent,
  type GenerateReviewRequest,
  type NormalizedReviewRequest,
  normalizeReviewRequest,
  REVIEW_GENERATION_PRESENCE_PENALTY,
  REVIEW_GENERATION_SYSTEM_PROMPT,
  REVIEW_GENERATION_TEMPERATURE,
} from "@/lib/review-generator";

async function generateWithOpenAI(input: NormalizedReviewRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: REVIEW_GENERATION_TEMPERATURE,
      presence_penalty: REVIEW_GENERATION_PRESENCE_PENALTY,
      input: [
        {
          role: "system",
          content: REVIEW_GENERATION_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: buildReviewPromptUserContent(input),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "review_pattern",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["review"],
            properties: {
              review: { type: "string" },
            },
          },
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data.output_text;
  if (typeof text !== "string") {
    return null;
  }

  const parsed = JSON.parse(text) as { review?: string };
  return parsed.review?.trim() || null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateReviewRequest;
    const input = normalizeReviewRequest(body);
    const generated = await generateWithOpenAI(input);
    const review = generated ?? buildFallbackReviews(input)[0];

    return NextResponse.json({
      review,
      reviews: [review],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "口コミの生成に失敗しました。" },
      { status: 500 },
    );
  }
}
