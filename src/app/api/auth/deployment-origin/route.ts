import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public login policy only; never authorizes a session or access to customer data. */
export async function POST(request: Request) {
  const host = process.env.VERCEL_URL;
  // Metadata is read only on the server. The suffix validates its shape, not the
  // caller: permission below always requires the entire exact origin to match.
  const validHost = host && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/.test(host);
  const expected = validHost ? `https://${host}` : null;
  const allowed = process.env.AUTH_ALLOW_EXACT_VERCEL_DEPLOYMENT_ORIGIN === "true"
    && expected !== null && request.headers.get("origin") === expected;
  // No Host, forwarded header, query/body input, CORS or shared-cache decision.
  return NextResponse.json({ origin: allowed ? expected : null }, {
    status: allowed ? 200 : 403,
    headers: { "Cache-Control": "no-store" },
  });
}
