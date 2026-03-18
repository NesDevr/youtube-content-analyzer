import { NextRequest, NextResponse } from "next/server";
import { summarizeVideo } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, title, views, likes, transcript } = await req.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "Transcript is required" },
        { status: 400 }
      );
    }

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
