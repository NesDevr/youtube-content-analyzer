import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceActionSchema, parseBody } from "@/lib/validation";
import { Prisma } from "@prisma/client";

// GET /api/workspaces — every workspace, including archived ones, with counts
export async function GET() {
  try {
    const workspaces = await prisma.channelWorkspace.findMany({
      include: {
        _count: { select: { folders: true, panels: true, ideaGenerations: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Workspaces error:", error);
    return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
  }
}

// POST /api/workspaces — create or update (status changes archive/restore too)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(workspaceActionSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const data = parsed.data;

    if (data.action === "create") {
      const { action: _action, name, ...rest } = data;
      void _action;
      const workspace = await prisma.channelWorkspace.create({
        data: { name: name.trim(), ...rest },
      });
      return NextResponse.json({ workspace });
    }

    const { action: _action, id, name, ...rest } = data;
    void _action;
    const existing = await prisma.channelWorkspace.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: `Workspace ${id} not found` }, { status: 404 });
    }

    const workspace = await prisma.channelWorkspace.update({
      where: { id },
      data: { ...rest, ...(name === undefined ? {} : { name: name.trim() }) },
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A workspace with that name already exists" },
        { status: 409 }
      );
    }
    console.error("Workspace action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workspace operation failed" },
      { status: 500 }
    );
  }
}
