import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, researchJobActionSchema, RESEARCH_JOB_SCHEMA_VERSION } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });

  const jobs = await prisma.researchJob.findMany({
    where: { workspaceId: workspace.workspaceId },
    include: { evidence: { orderBy: { createdAt: "asc" } }, ideas: { select: { id: true, title: true, status: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  const parsed = parseBody(researchJobActionSchema, await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const workspace = await resolveWorkspaceId(String(parsed.data.workspaceId));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });

  if (parsed.data.action === "resume") {
    const job = await prisma.researchJob.findFirst({ where: { id: parsed.data.id, workspaceId: workspace.workspaceId } });
    if (!job) return NextResponse.json({ error: "Research job not found in this workspace" }, { status: 404 });
    if (job.status === "completed") return NextResponse.json({ error: "Completed research jobs cannot be resumed" }, { status: 409 });
    const resumed = await prisma.researchJob.update({
      where: { id: job.id },
      data: { status: "queued", error: null, claimedAt: null },
    });
    return NextResponse.json({ job: resumed });
  }

  const collections = parsed.data.referenceCollectionIds.length
    ? await prisma.referenceCollection.findMany({
        where: { id: { in: parsed.data.referenceCollectionIds }, workspaceId: workspace.workspaceId },
        include: { items: { select: { videoId: true, title: true, use: true, note: true } } },
      })
    : [];
  if (collections.length !== parsed.data.referenceCollectionIds.length) {
    return NextResponse.json({ error: "One or more reference collections are not in this workspace" }, { status: 404 });
  }

  const [workspaceContext, trackedChannels, priorIdeas] = await Promise.all([
    prisma.channelWorkspace.findUniqueOrThrow({
      where: { id: workspace.workspaceId },
      select: { name: true, concept: true, positioning: true, constraints: true, language: true, country: true, targetAudience: true, contentFormat: true },
    }),
    prisma.trackedChannel.findMany({ where: { workspaceId: workspace.workspaceId }, select: { channelId: true, priority: true, refreshSchedule: true } }),
    prisma.idea.findMany({ where: { workspaceId: workspace.workspaceId }, select: { title: true, status: true, rejectionReason: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const job = await prisma.researchJob.create({
    data: {
      workspaceId: workspace.workspaceId,
      schemaVersion: RESEARCH_JOB_SCHEMA_VERSION,
      intent: parsed.data.intent,
      quotaBudget: parsed.data.quotaBudget,
      input: JSON.stringify({
        schemaVersion: RESEARCH_JOB_SCHEMA_VERSION,
        intent: parsed.data.intent,
        seeds: parsed.data.seeds,
        workspace: workspaceContext,
        trackedChannels,
        priorIdeas,
        referenceCollections: collections.map((collection) => ({
          id: collection.id, name: collection.name, question: collection.question, items: collection.items,
        })),
      }),
    },
  });
  return NextResponse.json({ job }, { status: 201 });
}
