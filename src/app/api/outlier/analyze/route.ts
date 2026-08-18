import { NextRequest, NextResponse } from "next/server";
import {
  parseVideoId,
  getUploadVideo,
  getChannelUploadsInfo,
  listPlaylistVideoIds,
  getUploadVideos,
  MAX_UPLOADS_SCANNED,
} from "@/lib/youtube";
import {
  classifyFormat,
  computeRecentMedianOutlier,
  legacyLifetimeAverageRatio,
  BASELINE_WINDOW_DAYS,
  LEGACY_LIFETIME_AVERAGE_METRIC,
  LEGACY_LIFETIME_AVERAGE_VERSION,
} from "@/lib/metrics/outlier";
import { outlierAnalyzeSchema, parseBody } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import {
  ANALYSIS_MAX_COST,
  rankSiblings,
  recordVideoSnapshots,
  reserveManualQuota,
  settleManualQuota,
  videoGrowth,
} from "@/lib/collection";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * POST /api/outlier/analyze — recent-median baseline for one video.
 *
 * Quota: 1 videos.list + 1 channels.list + up to 4 playlistItems.list +
 * up to 4 videos.list ≈ 10 units. No search.list is ever used here.
 */
export async function POST(req: NextRequest) {
  let quotaEventId: number | null = null;
  try {
    const body = await req.json();
    const parsed = parseBody(outlierAnalyzeSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const videoId = parseVideoId(parsed.data.url);
    if (!videoId) {
      return NextResponse.json(
        {
          error:
            "That is not a YouTube video URL or id. Accepted: watch?v=…, youtu.be/…, /shorts/…, /live/…, or a bare 11-character id.",
        },
        { status: 400 }
      );
    }

    const workspace = await prisma.channelWorkspace.findFirst({
      where: { id: parsed.data.workspaceId, status: { not: "archived" } },
      select: { id: true },
    });
    if (!workspace) {
      return NextResponse.json(
        { error: "Select an active channel workspace before saving an analysis." },
        { status: 404 }
      );
    }

    // 1 videos.list + 1 channels.list + up to 4 playlistItems.list + up to 4
    // videos.list. This is a manual investigation, so it may use the reserved
    // quota but cannot exceed the full daily budget.
    const quotaEvent = await reserveManualQuota("outlier analysis", ANALYSIS_MAX_COST, videoId);
    quotaEventId = quotaEvent.id;

    const target = await getUploadVideo(videoId);
    if (!target) {
      await settleManualQuota(quotaEventId, 1);
      quotaEventId = null;
      return NextResponse.json(
        { error: `Video ${videoId} was not returned by YouTube — it may be private, deleted or region-blocked.` },
        { status: 404 }
      );
    }

    const channel = await getChannelUploadsInfo(target.channelId);
    if (!channel) {
      await settleManualQuota(quotaEventId, 2);
      quotaEventId = null;
      return NextResponse.json(
        { error: `Channel ${target.channelId} has no public uploads playlist, so no baseline can be built.` },
        { status: 404 }
      );
    }

    const uploadIds = await listPlaylistVideoIds(
      channel.uploadsPlaylistId,
      MAX_UPLOADS_SCANNED
    );
    const { videos: uploads, missingIds } = await getUploadVideos(uploadIds);

    // Every upload read here is a real observation, so it is stored like any
    // other collection. That is what lets a second analysis of the same video
    // report measured growth instead of dividing lifetime views by age.
    const collectedAt = new Date();
    await recordVideoSnapshots(
      [
        {
          channelId: target.channelId,
          videos: uploads.map((upload) => ({
            id: upload.id,
            views: upload.views,
            publishedAt: upload.publishedAt,
          })),
        },
      ],
      collectedAt
    );

    const recentMedian = computeRecentMedianOutlier(target.video, uploads);
    const growth = await videoGrowth(target.video.id);

    // The scan only reaches back MAX_UPLOADS_SCANNED uploads. If the baseline
    // window extends past the oldest upload we looked at, say so instead of
    // presenting a possibly incomplete sample as complete.
    const oldestScanned = uploads.reduce<Date | null>(
      (oldest, upload) =>
        oldest === null || upload.publishedAt < oldest ? upload.publishedAt : oldest,
      null
    );
    const scannedWholeChannel = uploadIds.length < MAX_UPLOADS_SCANNED;
    const windowStartNeeded =
      target.video.publishedAt.getTime() - BASELINE_WINDOW_DAYS * DAY_MS;
    const baselineWindowTruncated =
      !scannedWholeChannel &&
      oldestScanned !== null &&
      oldestScanned.getTime() > windowStartNeeded;

    const result = {
      target: {
        id: target.video.id,
        title: target.video.title,
        channelId: target.channelId,
        channelName: target.channelName,
        thumbnailUrl: target.thumbnailUrl,
        publishedAt: target.video.publishedAt.toISOString(),
        views: target.video.views,
        likes: target.likes,
        comments: target.comments,
        durationSeconds: target.video.durationSeconds,
        format: classifyFormat(target.video),
      },
      channel: {
        id: channel.id,
        name: channel.name,
        subscribers: channel.subscribers,
        uploadsPlaylistId: channel.uploadsPlaylistId,
      },
      collection: {
        uploadsScanned: uploadIds.length,
        uploadsRetrieved: uploads.length,
        unavailableUploads: missingIds.length,
        scannedWholeChannel,
        maxUploadsScanned: MAX_UPLOADS_SCANNED,
        oldestUploadScanned: oldestScanned?.toISOString() ?? null,
        baselineWindowTruncated,
        estimatedQuotaUnits:
          2 + Math.ceil(uploadIds.length / 50) * 2,
      },
      recentMedian,
      /**
       * Measured from stored observations of this video, including the one just
       * written. A first analysis therefore reports why it has no rate yet.
       */
      growth,
      /** Other uploads on the same channel, scored by the same rules. */
      ...rankSiblings(uploads, collectedAt, target.video.id),
      legacy: {
        metric: LEGACY_LIFETIME_AVERAGE_METRIC,
        formulaVersion: LEGACY_LIFETIME_AVERAGE_VERSION,
        ratio:
          target.video.views === null
            ? null
            : legacyLifetimeAverageRatio(
                target.video.views,
                channel.lifetimeAverageViews
              ),
        channelLifetimeAverageViews: channel.lifetimeAverageViews,
        note: "Lifetime channel average across every format and every year. Kept for comparison only.",
      },
    };

    const saved = await prisma.outlierAnalysis.create({
      data: {
        workspaceId: workspace.id,
        videoId: target.video.id,
        metric: recentMedian.metric,
        formulaVersion: recentMedian.formulaVersion,
        sampleSize: recentMedian.sampleSize,
        comparisonWindowDays: recentMedian.comparisonWindowDays,
        format: recentMedian.format,
        collectedAt: new Date(recentMedian.collectedAt),
        result: JSON.stringify(result),
      },
      select: { id: true, createdAt: true },
    });

    await settleManualQuota(quotaEventId, result.collection.estimatedQuotaUnits);

    return NextResponse.json({ ...result, savedAnalysis: saved });
  } catch (error) {
    console.error("Outlier analyze error:", error);
    if (quotaEventId !== null) {
      await settleManualQuota(
        quotaEventId,
        0,
        error instanceof Error ? error.message : "Analysis failed"
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
