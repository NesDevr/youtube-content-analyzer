import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Everything a workspace has already kept: verified outliers, saved videos and
 * written observations. Reference collections are served by /api/references,
 * which the save form also needs.
 *
 * The stored analysis blob is read here so the library can show the title and
 * the ratio that was measured, rather than a bare video id. A row whose blob no
 * longer parses is listed with what the columns hold, not silently dropped.
 */
export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  const workspaceId = workspace.workspaceId;

  const [analyses, folders, observations] = await Promise.all([
    prisma.outlierAnalysis.findMany({ where: { workspaceId }, orderBy: { collectedAt: "desc" }, take: 100 }),
    prisma.folder.findMany({ where: { workspaceId }, include: { videos: { include: { video: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.manualObservation.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);

  const outliers = analyses.map((analysis) => {
    let target: { title?: string; thumbnailUrl?: string; channelName?: string; views?: number | null } | null = null;
    let ratio: number | null = null;
    let status = "";
    try {
      const parsed = JSON.parse(analysis.result);
      target = parsed.target ?? null;
      ratio = parsed.recentMedian?.ratio ?? null;
      status = parsed.recentMedian?.status ?? "";
    } catch {
      status = "the stored analysis could not be read";
    }
    return {
      id: analysis.id,
      videoId: analysis.videoId,
      title: target?.title ?? "",
      thumbnailUrl: target?.thumbnailUrl ?? "",
      channelName: target?.channelName ?? "",
      views: target?.views ?? null,
      ratio,
      status,
      metric: analysis.metric,
      sampleSize: analysis.sampleSize,
      collectedAt: analysis.collectedAt,
    };
  });

  return NextResponse.json({
    outliers,
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      videos: folder.videos.map(({ video }) => ({
        id: video.id,
        title: video.title,
        channelName: video.channelName,
        thumbnailUrl: video.thumbnailUrl,
        views: video.views,
      })),
    })),
    observations: observations.map((observation) => ({
      id: observation.id,
      entityType: observation.entityType,
      entityId: observation.entityId,
      topic: observation.topic,
      viewerPromise: observation.viewerPromise,
      titleThumbnail: observation.titleThumbnail,
      notes: observation.notes,
      updatedAt: observation.updatedAt,
    })),
  });
}
