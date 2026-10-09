export type AioUsage = { requests: number; completedRequests: number; inputTokens: number; cachedTokens: number; outputTokens: number; searchCalls: number; usageComplete: boolean };
export const newAioUsage = (): AioUsage => ({ requests: 0, completedRequests: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, searchCalls: 0, usageComplete: true });
export function recordAioUsage(audit: AioUsage, payload: { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }; output?: Array<{ type?: string; status?: string }> }) {
  audit.completedRequests++;
  const usage = payload.usage;
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens) || usage.input_tokens! < 0 || usage.output_tokens! < 0) audit.usageComplete = false;
  else { audit.inputTokens += usage.input_tokens!; audit.outputTokens += usage.output_tokens!; audit.cachedTokens += Math.min(usage.input_tokens!, Math.max(0, usage.input_tokens_details?.cached_tokens || 0)); }
  audit.searchCalls += payload.output?.filter(item => item.type === "web_search_call" && item.status === "completed").length || 0;
}
// Planning range: search content may already be included in returned usage.
// Upper estimate adds the documented 8k block, lower avoids double counting.
// This is not an invoice; failed/incomplete usage has no invented cost.
export function aioCost(usage: AioUsage, model: string) {
  if (!model.startsWith("gpt-4.1-mini") || !usage.usageComplete || usage.requests !== usage.completedRequests) return null;
  const lower = ((usage.inputTokens - usage.cachedTokens) * .4 + usage.cachedTokens * .1 + usage.outputTokens * 1.6) / 1000000 + usage.searchCalls * .01;
  return { lower, upper: lower + usage.searchCalls * 8000 * .4 / 1000000, currency: "USD", pricingDate: "2026-10-09" };
}
export function aioMetadata(value: unknown): { sources: Array<{ url: string; title: string }>; usage: AioUsage | null } {
  const envelope = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const raw = Array.isArray(value) ? value : envelope?.version === 2 ? envelope.sources : [];
  const sources = (Array.isArray(raw) ? raw : []).flatMap(item => {
    if (!item || typeof item.url !== "string" || typeof item.title !== "string") return [];
    try { const url = new URL(item.url); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? [{ url: item.url, title: item.title }] : []; } catch { return []; }
  });
  const usage = envelope?.version === 2 ? envelope.usage as AioUsage | undefined : undefined;
  const valid = usage && [usage.requests, usage.completedRequests, usage.inputTokens, usage.cachedTokens, usage.outputTokens, usage.searchCalls].every(n => Number.isSafeInteger(n) && n >= 0) && typeof usage.usageComplete === "boolean";
  return { sources, usage: valid ? usage : null };
}
