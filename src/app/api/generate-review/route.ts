import { NextResponse } from "next/server";
import {
  buildReviewPromptUserContent,
  type GenerateReviewRequest,
  type NormalizedReviewRequest,
  normalizeReviewRequest,
  REVIEW_GENERATION_SYSTEM_PROMPT,
  REVIEW_GENERATION_TEMPERATURE,
} from "@/lib/review-generator";

async function generateWithOpenAI(input: NormalizedReviewRequest) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("NOT_CONFIGURED");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      temperature: REVIEW_GENERATION_TEMPERATURE,
      store: false,
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
  if (data.status !== "completed" || !Array.isArray(data.output)) throw new Error("INVALID_OUTPUT");
  const parts = data.output.filter((item: { type: string }) => item.type === "message")
    .flatMap((item: { content: { type: string; text?: string }[] }) => item.content);
  if (parts.some((part: { type: string }) => part.type === "refusal")) throw new Error("REFUSED");
  const text = parts.filter((part: { type: string }) => part.type === "output_text").map((part: { text: string }) => part.text).join("");
  const parsed = JSON.parse(text) as { review?: string };
  if (typeof parsed.review !== "string" || !parsed.review.trim()) throw new Error("INVALID_OUTPUT");
  return parsed.review.trim();
}

export const maxDuration = 60;

export async function POST(request: Request) {
  let input: NormalizedReviewRequest;
  try {
    const body = (await request.json()) as GenerateReviewRequest;
    input = normalizeReviewRequest(body);
  } catch {
    return NextResponse.json({ message: "ご回答者様（保護者様 / 生徒ご本人様）を選択し、回答内容を確認してください。" }, { status: 400 });
  }
  try {
    const review = await generateWithOpenAI(input);
    return NextResponse.json({
      review,
      reviews: [review],
    });
  } catch (error) {
    const unconfigured = error instanceof Error && error.message === "NOT_CONFIGURED";
    console.error("[Generate Review]", { code: unconfigured ? "NOT_CONFIGURED" : "PROVIDER_FAILED" });
    return NextResponse.json(
      { message: unconfigured ? "AI生成の接続設定が未完了です。管理者にお問い合わせください。" : "口コミの生成に失敗しました。時間をおいて再度お試しください。" },
      { status: unconfigured ? 503 : 502 },
    );
  }
}
