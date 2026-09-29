import {
  buildReviewPromptUserContent,
  type NormalizedReviewRequest,
  REVIEW_GENERATION_SYSTEM_PROMPT,
  REVIEW_GENERATION_TEMPERATURE,
} from "./review-generator";

export class ReviewGenerationError extends Error {
  constructor(readonly code: "NOT_CONFIGURED" | "PROVIDER_FAILED" | "INVALID_OUTPUT", readonly status: number) {
    super(code);
    this.name = "ReviewGenerationError";
  }
}

// All choice text and school names are data, not keys in a prose dictionary.
export async function buildUniversalReview(input: NormalizedReviewRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ReviewGenerationError("NOT_CONFIGURED", 503);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: REVIEW_GENERATION_TEMPERATURE,
        store: false,
        input: [
          { role: "system", content: REVIEW_GENERATION_SYSTEM_PROMPT },
          { role: "user", content: buildReviewPromptUserContent(input) },
        ],
        text: {
          format: {
            type: "json_schema", name: "review_pattern", strict: true,
            schema: {
              type: "object", additionalProperties: false, required: ["review"],
              properties: { review: { type: "string" } },
            },
          },
        },
      }),
    });
    if (!response.ok) throw new ReviewGenerationError("PROVIDER_FAILED", response.status === 429 ? 429 : 502);
    const data = await response.json();
    if (data?.status !== "completed" || !Array.isArray(data.output)) throw new ReviewGenerationError("INVALID_OUTPUT", 502);
    const parts = data.output.filter((item: { type: string }) => item.type === "message")
      .flatMap((item: { content: { type: string; text?: string }[] }) => item.content);
    if (parts.some((part: { type: string }) => part.type === "refusal")) throw new ReviewGenerationError("INVALID_OUTPUT", 502);
    const text = parts.filter((part: { type: string }) => part.type === "output_text")
      .map((part: { text: string }) => part.text).join("");
    const parsed = JSON.parse(text) as { review?: string } | null;
    if (typeof parsed?.review !== "string" || !parsed.review.trim()) throw new ReviewGenerationError("INVALID_OUTPUT", 502);
    return parsed.review.replace(/\s+/g, " ").trim();
  } catch (error) {
    if (error instanceof ReviewGenerationError) throw error;
    throw new ReviewGenerationError("PROVIDER_FAILED", 502);
  }
}
