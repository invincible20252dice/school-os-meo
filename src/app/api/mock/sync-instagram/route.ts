import { NextResponse } from "next/server";
import { buildMockInstagramSyncPreview } from "@/lib/mock-instagram-sync";

export async function POST() {
  const preview = await buildMockInstagramSyncPreview();

  return NextResponse.json(preview);
}
