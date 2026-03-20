import { NextRequest, NextResponse } from "next/server";
import { summarizeVideo } from "@/lib/gemini";
import { aiSummarizeSchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(aiSummarizeSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { title, views, likes, transcript } = parsed.data;

    const summary = await summarizeVideo(
      title || "Unknown",
      transcript,
      views || 0,
      likes || 0
    );

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to summarize" },
      { status: 500 }
    );
  }
}
