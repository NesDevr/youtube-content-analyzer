import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// POST /api/folders — create folder or add video to folder
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Create a new folder
    if (body.action === "create") {
      const folder = await prisma.folder.create({
        data: { name: body.name },
      });
      return NextResponse.json({ folder });
    }

    // Add a video to a folder
    if (body.action === "addVideo") {
      // Ensure the video exists in DB first
      const video = await prisma.video.findUnique({ where: { id: body.videoId } });
      if (!video) {
        return NextResponse.json({ error: "Video not found in database" }, { status: 404 });
      }

      await prisma.folderVideo.upsert({
        where: {
          folderId_videoId: {
            folderId: body.folderId,
            videoId: body.videoId,
          },
        },
        update: {},
        create: {
          folderId: body.folderId,
          videoId: body.videoId,
        },
      });
      return NextResponse.json({ success: true });
    }

    // Remove a video from a folder
    if (body.action === "removeVideo") {
      await prisma.folderVideo.delete({
        where: {
          folderId_videoId: {
            folderId: body.folderId,
            videoId: body.videoId,
          },
        },
      });
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
    await prisma.folder.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
