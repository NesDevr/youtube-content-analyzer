import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace";

/** Saved, workspace-scoped material available to seed a Codex research job. */
export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  const workspaceId = workspace.workspaceId;
  const [folders, outliers, observations] = await Promise.all([
    prisma.folder.findMany({
      where: { workspaceId }, include: { videos: { include: { video: true } } }, orderBy: { createdAt: "desc" },
    }),
    prisma.outlierAnalysis.findMany({ where: { workspaceId }, orderBy: { collectedAt: "desc" }, take: 50 }),
    prisma.manualObservation.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const seeds = [
    ...folders.flatMap((folder) => folder.videos.map(({ video }) => ({ kind: "video", id: video.id, label: video.title, note: `Saved in ${folder.name}; ${video.channelName}` }))),
    ...outliers.map((outlier) => ({ kind: "outlier", id: String(outlier.id), label: `Verified outlier: ${outlier.videoId}`, note: `${outlier.metric}; sample ${outlier.sampleSize}` })),
    ...observations.map((observation) => ({ kind: "observation", id: String(observation.id), label: observation.topic || `${observation.entityType} observation`, note: observation.viewerPromise || observation.notes })),
  ];
  return NextResponse.json({ seeds });
}
