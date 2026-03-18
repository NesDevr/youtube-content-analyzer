import { NextRequest, NextResponse } from "next/server";
import { findOutliers } from "@/lib/youtube";
import { youtubeSearchSchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(youtubeSearchSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const results = await findOutliers(parsed.data);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
