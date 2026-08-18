import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

const observationSchema = z.object({
  workspaceId: z.int().positive(),
  entityType: z.enum(["video", "channel", "topic"]),
  entityId: z.string().min(1).max(200),
  topic: z.string().max(500).optional(),
  viewerPromise: z.string().max(2000).optional(),
  titleThumbnail: z.string().max(2000).optional(),
  formatNotes: z.string().max(2000).optional(),
  productionStyle: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});

/** Observations already recorded in this workspace, newest first. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const workspace = await resolveWorkspaceId(params.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });

  const entityId = params.get("entityId");
  const observations = await prisma.manualObservation.findMany({
    where: { workspaceId: workspace.workspaceId, ...(entityId ? { entityId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return NextResponse.json({ observations });
}

export async function POST(req: NextRequest) {
  const parsed = parseBody(observationSchema, await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const workspace = await resolveWorkspaceId(String(parsed.data.workspaceId));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  const observation = await prisma.manualObservation.create({
    data: {
      workspaceId: workspace.workspaceId,
      entityType: parsed.data.entityType,
      entityId: parsed.data.entityId,
      topic: parsed.data.topic,
      viewerPromise: parsed.data.viewerPromise,
      titleThumbnail: parsed.data.titleThumbnail,
      formatNotes: parsed.data.formatNotes,
      productionStyle: parsed.data.productionStyle,
      notes: parsed.data.notes,
    },
  });
  return NextResponse.json({ observation });
}
