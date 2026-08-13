import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace";

// GET /api/folders/[id]?workspaceId=1 — folder with its videos
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const workspace = await resolveWorkspaceId(
      req.nextUrl.searchParams.get("workspaceId")
    );
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    const { id } = await params;
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId)) {
      return NextResponse.json({ error: "Invalid folder ID" }, { status: 400 });
    }

    // Scoped by workspace: a folder from another workspace is not visible here.
    const folder = await prisma.folder.findFirst({
      where: { id: parsedId, workspaceId: workspace.workspaceId },
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
