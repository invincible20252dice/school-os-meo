type FetchLike = typeof fetch;

type FormatCaptionInput = {
  schoolName: string;
  caption: string;
};

function removeHashtags(text: string) {
  return text.replace(/#[^\s#]+/g, "").replace(/\s{2,}/g, " ").trim();
}

function reduceRepeatedEmoji(text: string) {
  return text.replace(/([\u{1F300}-\u{1FAFF}])\1+/gu, "$1");
}

function buildFallbackFormattedCaption(input: FormatCaptionInput) {
  const cleaned = reduceRepeatedEmoji(removeHashtags(input.caption));
  const body = cleaned || "教室での取り組みをご紹介します。";

  return `${input.schoolName}よりお知らせです。${body} 詳細や体験授業については、お気軽にお問い合わせください。`;
}

export async function formatInstagramCaptionForGbp(
  input: FormatCaptionInput,
  fetchImpl: FetchLike = fetch,
) {
  if (!process.env.OPENAI_API_KEY) {
    return buildFallbackFormattedCaption(input);
  }

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input: [
        {
          role: "system",
          content:
            "Instagram投稿文をGoogleビジネスプロフィール投稿向けに整えます。ハッシュタグを削除し、絵文字を控えめにし、学習塾として自然で丁寧な文章にしてください。本文のみ返してください。",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI caption formatting failed: ${response.status}`);
  }

  const data = await response.json();

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  return buildFallbackFormattedCaption(input);
}
