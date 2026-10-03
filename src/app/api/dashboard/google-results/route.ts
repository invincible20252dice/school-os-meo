import { NextResponse } from "next/server";
import { leadBody, leadFailure, leadHeaders, leadScope } from "@/lib/google-lead-access";
import { changeGoogleLead, createGoogleLead, loadGoogleLeads } from "@/lib/google-lead-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { school, url } = await leadScope(request);
    return NextResponse.json({ success: true, school, ...await loadGoogleLeads(school.id, url.searchParams.get("period") || "month") }, { headers: leadHeaders });
  } catch (error) { return leadFailure(error); }
}
export async function POST(request: Request) {
  try {
    const { school } = await leadScope(request);
    return NextResponse.json({ success: true, lead: await createGoogleLead(school.id, await leadBody(request)) }, { headers: leadHeaders });
  } catch (error) { return leadFailure(error); }
}
async function update(request: Request, remove: boolean) {
  try {
    const { school } = await leadScope(request);
    return NextResponse.json({ success: true, ...await changeGoogleLead(school.id, await leadBody(request), remove) }, { headers: leadHeaders });
  } catch (error) { return leadFailure(error); }
}
export const PATCH = (request: Request) => update(request, false);
export const DELETE = (request: Request) => update(request, true);
