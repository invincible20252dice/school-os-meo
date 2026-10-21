import { NextResponse } from "next/server";
import { leadFailure, leadHeaders, leadScope } from "@/lib/google-lead-access";
import { loadGoogleLeadOperation } from "@/lib/google-lead-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { school, url, userId } = await leadScope(request);
    const state = await loadGoogleLeadOperation(school.id, url.searchParams.get("operationId") || "", userId);
    return NextResponse.json({ success: true, state }, { headers: leadHeaders });
  } catch (error) { return leadFailure(error); }
}
