import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/folders/[id] — get folder with its videos
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId)) {
      return NextResponse.json({ error: "Invalid folder ID" }, { status: 400 });
    }
    const folder = await prisma.folder.findUnique({
      where: { id: parsedId },
      include: {
        videos: {
          include: { video: true },
          orderBy: { addedAt: "desc" },
        },
      },
    });

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Folder detail error:", error);
    return NextResponse.json({ error: "Failed to fetch folder" }, { status: 500 });
  }
}
