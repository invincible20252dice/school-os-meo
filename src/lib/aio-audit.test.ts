import { expect, it } from "vitest";
import { aioCost, aioMetadata, newAioUsage, recordAioUsage } from "./aio-audit";
it("records actual request usage and a documented estimate range", () => {
  const usage = newAioUsage(); usage.requests = 1;
  recordAioUsage(usage, { usage: { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 100 } }, output: [{ type: "web_search_call", status: "completed" }] });
  expect(usage).toMatchObject({ requests: 1, completedRequests: 1, inputTokens: 1000, cachedTokens: 100, outputTokens: 500, searchCalls: 1 });
  expect(aioCost(usage, "gpt-4.1-mini")!.lower).toBeCloseTo(.01117, 8);
  expect(aioCost(usage, "gpt-4.1-mini")!.upper).toBeCloseTo(.01437, 8);
  expect(aioCost(usage, "unknown")).toBeNull();
  usage.requests++; expect(aioCost(usage, "gpt-4.1-mini")).toBeNull();
});
it("does not invent missing or invalid token usage", () => {
  for (const payload of [{}, { usage: { input_tokens: -1, output_tokens: 0 } }]) {
    const usage = newAioUsage(); usage.requests = 1; recordAioUsage(usage, payload);
    expect(aioCost(usage, "gpt-4.1-mini")).toBeNull();
  }
  const usage = newAioUsage(); recordAioUsage(usage, { usage: { input_tokens: 1, output_tokens: 1 } });
  expect(usage.cachedTokens).toBe(0);
});
it("reads old arrays and new envelopes, refusing malformed audit data and unsafe links", () => {
  const sources = [{ url: "https://example.org", title: "出典" }];
  expect(aioMetadata(sources)).toEqual({ sources, usage: null });
  expect(aioMetadata({ version: 2, sources, usage: newAioUsage() }).usage).toEqual(newAioUsage());
  for (const value of [null, {}, { version: 3, sources }, { version: 2, sources: false, usage: { requests: "bad" } }]) expect(aioMetadata(value)).toEqual({ sources: [], usage: null });
  expect(aioMetadata([null, {}, { url: "javascript:alert(1)", title: "bad" }, { url: "bad", title: "bad" }, { url: "https://user:secret@example.org", title: "bad" }]).sources).toEqual([]);
});
