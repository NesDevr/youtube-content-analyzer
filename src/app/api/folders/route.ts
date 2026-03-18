import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { folderActionSchema, parseBody } from "@/lib/validation";

// GET /api/folders — list all folders with video count
export async function GET() {
  try {
    const folders = await prisma.folder.findMany({
      include: { _count: { select: { videos: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Folders error:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

// POST /api/folders — create folder or add/remove video
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(folderActionSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const data = parsed.data;

    if (data.action === "create") {
      const folder = await prisma.folder.create({
        data: { name: data.name.trim() },
      });
      return NextResponse.json({ folder });
    }

    if (data.action === "addVideo") {
      const video = await prisma.video.findUnique({ where: { id: data.videoId } });
      if (!video) {
        return NextResponse.json({ error: "Video not found in database" }, { status: 404 });
      }

      await prisma.folderVideo.upsert({
        where: {
          folderId_videoId: {
            folderId: data.folderId,
            videoId: data.videoId,
          },
        },
        update: {},
        create: {
          folderId: data.folderId,
          videoId: data.videoId,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (data.action === "removeVideo") {
      const result = await prisma.folderVideo.deleteMany({
        where: {
          folderId: data.folderId,
          videoId: data.videoId,
        },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: "Video not found in folder" }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Folder action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Folder operation failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/folders?id=1
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Folder ID is required" }, { status: 400 });
    }
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId)) {
      return NextResponse.json({ error: "Invalid folder ID" }, { status: 400 });
    }
    await prisma.folder.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
