import { NextResponse } from "next/server";
import {
  buildFallbackReviews,
  type GenerateReviewRequest,
  type NormalizedReviewRequest,
  normalizeReviewRequest,
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
      input: [
        {
          role: "system",
          content:
            "あなたは学習塾の保護者口コミ作成を支援します。誇張や断定を避け、自然で投稿しやすい日本語の口コミを3案だけ作成してください。",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "review_patterns",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["reviews"],
            properties: {
              reviews: {
                type: "array",
                minItems: 3,
                maxItems: 3,
                items: { type: "string" },
              },
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

  const parsed = JSON.parse(text) as { reviews?: string[] };
  return parsed.reviews?.slice(0, 3) ?? null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateReviewRequest;
    const input = normalizeReviewRequest(body);
    const generated = await generateWithOpenAI(input);

    return NextResponse.json({
      reviews: generated ?? buildFallbackReviews(input),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: "口コミの生成に失敗しました。" },
      { status: 500 },
    );
  }
}
