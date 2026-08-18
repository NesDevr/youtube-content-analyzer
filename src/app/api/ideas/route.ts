import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ideaActionSchema, parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  const ideas = await prisma.idea.findMany({
    where: { workspaceId: workspace.workspaceId },
    include: { researchJob: { select: { id: true, intent: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ ideas });
}

export async function POST(req: NextRequest) {
  const parsed = parseBody(ideaActionSchema, await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const workspace = await resolveWorkspaceId(String(parsed.data.workspaceId));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  if (parsed.data.action === "create") {
    const { action, workspaceId, researchJobId, evidenceLinks, rejectedPackages, ...fields } = parsed.data;
    void action;
    void workspaceId;
    const data = {
      ...fields,
      ...(evidenceLinks === undefined ? {} : { evidenceLinks: JSON.stringify(evidenceLinks) }),
      ...(rejectedPackages === undefined ? {} : { rejectedPackages: JSON.stringify(rejectedPackages) }),
    };
    if (researchJobId) {
      const job = await prisma.researchJob.findFirst({ where: { id: researchJobId, workspaceId: workspace.workspaceId } });
      if (!job) return NextResponse.json({ error: "Research job not found in this workspace" }, { status: 404 });
    }
    const idea = await prisma.idea.create({ data: { ...data, workspaceId: workspace.workspaceId, researchJobId } });
    return NextResponse.json({ idea }, { status: 201 });
  }
  const { action, workspaceId, id, destinationWorkspaceId, evidenceLinks, rejectedPackages, ...fields } = parsed.data;
  void action;
  void workspaceId;
  if (destinationWorkspaceId) {
    const destination = await resolveWorkspaceId(String(destinationWorkspaceId));
    if (!destination.ok) return NextResponse.json({ error: destination.error }, { status: destination.status });
  }
  const data = {
    ...fields,
    ...(evidenceLinks === undefined ? {} : { evidenceLinks: JSON.stringify(evidenceLinks) }),
    ...(rejectedPackages === undefined ? {} : { rejectedPackages: JSON.stringify(rejectedPackages) }),
  };
  const idea = await prisma.idea.findFirst({ where: { id, workspaceId: workspace.workspaceId } });
  if (!idea) return NextResponse.json({ error: "Idea not found in this workspace" }, { status: 404 });
  const updated = await prisma.idea.update({
    where: { id: idea.id },
    data: { ...data, ...(destinationWorkspaceId ? { workspaceId: destinationWorkspaceId, researchJobId: null } : {}) },
  });
  return NextResponse.json({ idea: updated });
}
