import { NextRequest, NextResponse } from "next/server";
import { generateKeywords, brainstormKeywords } from "@/lib/claude";

export async function POST(req: NextRequest) {
  try {
    const { topic, mode } = await req.json();

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    if (mode === "brainstorm") {
      const result = await brainstormKeywords(topic);
      return NextResponse.json(result);
    }

    const keywords = await generateKeywords(topic);
    return NextResponse.json({ keywords });
  } catch (error) {
    console.error("AI keywords error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate keywords" },
      { status: 500 }
    );
  }
}
