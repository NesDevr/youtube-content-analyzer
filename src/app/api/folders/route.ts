import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { folderActionSchema, parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Every folder belongs to exactly one channel workspace. Reads and mutations
 * must name the workspace they operate on, and a folder from another workspace
 * is treated as not found.
 */
async function findFolderInWorkspace(folderId: number, workspaceId: number) {
  return prisma.folder.findFirst({
    where: { id: folderId, workspaceId },
    select: { id: true },
  });
}

// GET /api/folders?workspaceId=1 — folders in one workspace with video counts
export async function GET(req: NextRequest) {
  try {
    const workspace = await resolveWorkspaceId(
      req.nextUrl.searchParams.get("workspaceId")
    );
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    const folders = await prisma.folder.findMany({
      where: { workspaceId: workspace.workspaceId },
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

    const workspace = await resolveWorkspaceId(data.workspaceId);
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }
    const { workspaceId } = workspace;

    if (data.action === "create") {
      const folder = await prisma.folder.create({
        data: { name: data.name.trim(), workspaceId },
      });
      return NextResponse.json({ folder });
    }

    const folder = await findFolderInWorkspace(data.folderId, workspaceId);
    if (!folder) {
      return NextResponse.json(
        { error: `Folder ${data.folderId} not found in workspace ${workspaceId}` },
        { status: 404 }
      );
    }

    if (data.action === "addVideo") {
      // Search results are computed in memory, so the video usually does not
      // exist yet. The client sends the full payload and we persist it here;
      // `Video` is global public evidence shared by every workspace.
      if (data.video) {
        if (data.video.id !== data.videoId) {
          return NextResponse.json(
            { error: "video.id does not match videoId" },
            { status: 400 }
          );
        }
        const publishedAt = new Date(data.video.publishedAt);
        if (Number.isNaN(publishedAt.getTime())) {
          return NextResponse.json(
            { error: `Invalid publishedAt: ${data.video.publishedAt}` },
            { status: 400 }
          );
        }
        const videoData = {
          title: data.video.title,
          channelId: data.video.channelId,
          channelName: data.video.channelName,
          views: data.video.views,
          likes: data.video.likes,
          comments: data.video.comments,
          duration: data.video.duration,
          publishedAt,
          thumbnailUrl: data.video.thumbnailUrl,
          description: data.video.description ?? "",
          outlierScore: data.video.outlierScore ?? null,
          viewsPerHour: data.video.viewsPerHour ?? null,
        };
        await prisma.video.upsert({
          where: { id: data.videoId },
          update: videoData,
          create: { id: data.videoId, ...videoData },
        });
      } else {
        const video = await prisma.video.findUnique({ where: { id: data.videoId } });
        if (!video) {
          return NextResponse.json(
            {
              error:
                "Video not found in database and no video details were supplied to save it",
            },
            { status: 404 }
          );
        }
      }

      await prisma.folderVideo.upsert({
        where: {
          folderId_videoId: { folderId: data.folderId, videoId: data.videoId },
        },
        update: {},
        create: { folderId: data.folderId, videoId: data.videoId },
      });
      return NextResponse.json({ success: true });
    }

    const result = await prisma.folderVideo.deleteMany({
      where: { folderId: data.folderId, videoId: data.videoId },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Video not found in folder" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Folder action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Folder operation failed" },
      { status: 500 }
    );
  }
}

// DELETE /api/folders?id=1&workspaceId=1
export async function DELETE(req: NextRequest) {
  try {
    const workspace = await resolveWorkspaceId(
      req.nextUrl.searchParams.get("workspaceId")
    );
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Folder ID is required" }, { status: 400 });
    }
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId)) {
      return NextResponse.json({ error: "Invalid folder ID" }, { status: 400 });
    }

    const folder = await findFolderInWorkspace(parsedId, workspace.workspaceId);
    if (!folder) {
      return NextResponse.json(
        { error: `Folder ${parsedId} not found in workspace ${workspace.workspaceId}` },
        { status: 404 }
      );
    }

    await prisma.folder.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete folder error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
