import { NextRequest, NextResponse } from "next/server";
import { generateKeywords, brainstormKeywords } from "@/lib/claude";
import { keywordsAiSchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(keywordsAiSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { topic, mode } = parsed.data;

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
