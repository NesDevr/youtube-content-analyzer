import { NextRequest, NextResponse } from "next/server";
import { analyzeVideos } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { aiIdeasSchema, parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(aiIdeasSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { videos, folderId } = parsed.data;

    const workspace = await resolveWorkspaceId(parsed.data.workspaceId);
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    const result = await analyzeVideos(videos);

    await prisma.ideaGeneration.create({
      data: {
        folderId: folderId || null,
        workspaceId: workspace.workspaceId,
        prompt: JSON.stringify(videos.map((v) => v.title)),
        result: JSON.stringify(result),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI ideas error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate ideas" },
      { status: 500 }
    );
  }
}
