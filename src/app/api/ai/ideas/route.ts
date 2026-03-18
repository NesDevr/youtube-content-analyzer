import { NextRequest, NextResponse } from "next/server";
import { analyzeVideos } from "@/lib/claude";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { videos, folderId } = await req.json();

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json(
        { error: "At least one video is required" },
        { status: 400 }
      );
    }

    const result = await analyzeVideos(videos);

    // Save to DB
    await prisma.ideaGeneration.create({
      data: {
        folderId: folderId || null,
        prompt: JSON.stringify(videos.map((v: { title: string }) => v.title)),
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
