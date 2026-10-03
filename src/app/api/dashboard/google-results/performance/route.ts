import { NextResponse } from "next/server";
import { leadFailure, leadHeaders, leadScope } from "@/lib/google-lead-access";
import { loadPerformance } from "@/lib/google-performance";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { school, url } = await leadScope(request);
    return NextResponse.json({ success: true, data: await loadPerformance(school.id, url.searchParams.get("period") || "month") }, { headers: leadHeaders });
  } catch (error) { return leadFailure(error); }
}
