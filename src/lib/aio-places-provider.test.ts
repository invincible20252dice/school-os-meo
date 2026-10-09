import { afterEach, expect, it, vi } from "vitest";
import { createPlacesClient, DETAILS_MASK, SEARCH_MASK } from "./aio-places-provider";

afterEach(() => vi.unstubAllEnvs());
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const place = { id: "ChIJ_fixture", displayName: { text: "検証予備校" }, formattedAddress: "検証県検証市1", rating: 4.5, userRatingCount: 31, photos: [{}], primaryType: "school", websiteUri: "https://example.org", googleMapsUri: "https://maps.google.com/?cid=1", attributions: [{ provider: "提供者", providerUri: "https://example.org/source" }] };
it("uses fixed hosts, explicit masks, header-only credentials and request-local dedup", async () => {
  const http = vi.fn().mockResolvedValueOnce(reply({ places: [place] })).mockResolvedValueOnce(reply(place));
  const client = createPlacesClient("test-only", http);
  const results = await client.search("検証予備校 検証市");
  expect(results[0].name).toBe("検証予備校");
  const [a, b] = await Promise.all([client.details("ChIJ_fixture"), client.details("ChIJ_fixture")]);
  expect(a).toEqual(b); expect(a).toMatchObject({ rating: 4.5, reviewCount: 31, photoCount: null, photoAvailable: true, website: true, replyRate: null, postAge: null });
  expect(client.requests()).toBe(2);
  expect(http.mock.calls[0][1]).toMatchObject({ cache: "no-store", headers: { "X-Goog-Api-Key": "test-only", "X-Goog-FieldMask": SEARCH_MASK } });
  expect(http.mock.calls[1][1].headers["X-Goog-FieldMask"]).toBe(DETAILS_MASK);
  expect(DETAILS_MASK).not.toMatch(/\*|reviews/);
  expect(JSON.parse(http.mock.calls[0][1].body)).toMatchObject({ pageSize: 3, languageCode: "ja", regionCode: "JP" });
  expect(http.mock.calls.map(c => c[0]).join()).not.toContain("test-only");
});
it.each([["SERVICE_DISABLED", "API_DISABLED"], ["BILLING_DISABLED", "BILLING_DISABLED"], ["API_KEY_INVALID", "AUTH_FAILED"], ["RATE_LIMIT_EXCEEDED", "RATE_LIMIT"], ["QUOTA_EXCEEDED", "QUOTA"]])("redacts provider reason %s", async (reason, code) => {
  const http = vi.fn().mockResolvedValue(reply({ error: { message: "secret-value", details: [{ reason }] } }, 403));
  await expect(createPlacesClient("test-only", http).details("abc")).rejects.toMatchObject({ message: code, code });
  expect(http).toHaveBeenCalledTimes(1);
});
it("does not call Google without a key or with an invalid ID", async () => {
  const http = vi.fn();
  await expect(createPlacesClient("", http).details("abc")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  await expect(createPlacesClient("x", http).details("../secret")).rejects.toMatchObject({ code: "INVALID_ID" });
  expect(http).not.toHaveBeenCalled();
});
it("keeps absent/invalid numbers unknown and returns photo presence, not a total", async () => {
  const http = vi.fn().mockResolvedValue(reply({ ...place, rating: 9, userRatingCount: -2, photos: [], websiteUri: "javascript:alert(1)", attributions: [] }));
  expect(await createPlacesClient("x", http).details(place.id)).toMatchObject({ rating: null, reviewCount: null, photoCount: null, photoAvailable: null, website: null });
});
it.each([429, 500, 403])("distinguishes HTTP %s failures", async status => {
  await expect(createPlacesClient("x", vi.fn().mockResolvedValue(reply({}, status))).details("abc")).rejects.toMatchObject({ code: status === 429 ? "RATE_LIMIT" : status === 403 ? "AUTH_FAILED" : "PROVIDER_FAILED" });
});
it("rejects malformed details, wrong identities and transport failures without leaking payloads", async () => {
  for (const result of [{}, { ...place, id: "wrong" }]) await expect(createPlacesClient("x", vi.fn().mockResolvedValue(reply(result))).details(place.id)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  await expect(createPlacesClient("x", vi.fn().mockRejectedValue(new Error("secret"))).details("abc")).rejects.toMatchObject({ code: "PROVIDER_FAILED" });
  await expect(createPlacesClient("x", vi.fn().mockRejectedValue(new DOMException("secret", "TimeoutError"))).details("abc")).rejects.toMatchObject({ code: "TIMEOUT" });
});
