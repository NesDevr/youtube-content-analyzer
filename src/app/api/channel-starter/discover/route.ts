import { NextRequest, NextResponse } from "next/server";
import { channelStarterDiscoverSchema, parseBody } from "@/lib/validation";
import { discoverNiches } from "@/lib/channel-starter";
import {
  searchVideos,
  getVideoDetails,
  getChannelStats,
} from "@/lib/youtube";
import { legacyLifetimeAverageRatio } from "@/lib/metrics/outlier";
import { prisma } from "@/lib/prisma";
import { resolveWorkspaceId } from "@/lib/workspace";
import { hashInputs, getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";
import type { NicheSuggestion, RawNiche } from "@/types/channel-starter";

/**
 * A 0-100 blend of three measured signals from one keyword search: how many of
 * the returned videos beat their channel's lifetime average by 5x, how large
 * that ratio gets, and how small the channels behind them are. Every input is
 * the legacy lifetime-average ratio, so this is a rough first-pass signal — not
 * a probability, and not a claim about the niche's future.
 *
 * Returns null when the search produced no comparable videos: an unmeasured
 * niche must read as unmeasured rather than as a low score.
 */
function computeLegacySignalScore(
  outlierRatios: number[],
  channelSubs: number[]
): number | null {
  if (outlierRatios.length === 0 || channelSubs.length === 0) return null;

  const highRatioShare =
    outlierRatios.filter((s) => s >= 5).length / outlierRatios.length;

  const sorted = [...outlierRatios].sort((a, b) => b - a);
  const top10 = sorted.slice(0, 10);
  const avgTopRatio = top10.reduce((a, b) => a + b, 0) / top10.length;
  const normalizedRatio = Math.min(avgTopRatio / 20, 1); // Cap at 20x

  const smallChannelRatio =
    channelSubs.filter((s) => s < 50000).length / channelSubs.length;

  const raw =
    highRatioShare * 0.45 + normalizedRatio * 0.3 + smallChannelRatio * 0.25;

  return Math.round(raw * 100);
}

/** Null when no channel was resolved — the level is unknown, not "medium". */
function computeCompetitionLevel(
  channelSubs: number[]
): "low" | "medium" | "high" | null {
  if (channelSubs.length === 0) return null;
  const sorted = [...channelSubs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median < 100000) return "low";
  if (median < 500000) return "medium";
  return "high";
}

/**
 * Measures one AI-proposed niche against a real YouTube search. Throws when the
 * search itself fails so the caller can report the niche as unvalidated instead
 * of inventing a score for it.
 */
async function validateNiche(
  niche: RawNiche,
  contentFilter?: "long-form" | "short-form" | "shorts" | "both"
): Promise<NicheSuggestion> {
  const primaryKeyword = niche.searchKeywords[0];
  if (!primaryKeyword) {
    throw new Error("Gemini returned a niche with no search keywords");
  }

  // Use YouTube's videoDuration filter to pre-filter by content type.
  // "medium" = 4-20 min (good fit for long-form), "short" = <4 min.
  const searchVideoType =
    contentFilter === "short-form" || contentFilter === "shorts"
      ? "short"
      : contentFilter === "long-form"
        ? "medium"
        : undefined;

  const videoIds = await searchVideos(
    { keyword: primaryKeyword, videoType: searchVideoType },
    1
  );
  if (videoIds.length === 0) {
    return {
      ...niche,
      legacySignalScore: null,
      competitionLevel: null,
      sampleSize: 0,
      exampleOutliers: [],
    };
  }

  // Get video details + channel stats
  const videos = await getVideoDetails(videoIds.slice(0, 20));

  const channelIds = videos.map((v) => v.channelId);
  const channelStats = await getChannelStats(channelIds);

  // Legacy lifetime-average ratios for the videos this keyword returned.
  const outlierRatios: number[] = [];
  const channelSubs: number[] = [];
  const outlierExamples: NicheSuggestion["exampleOutliers"] = [];

  for (const video of videos) {
    const channel = channelStats.get(video.channelId);
    if (!channel) continue;

    const ratio = legacyLifetimeAverageRatio(video.views, channel.averageViews);
    // A channel with no usable lifetime average cannot contribute a ratio.
    if (ratio === null) continue;

    channelSubs.push(channel.subscribers);
    outlierRatios.push(ratio);

    if (channel.subscribers < 200000 && ratio >= 3) {
      outlierExamples.push({
        id: video.id,
        title: video.title,
        channelName: video.channelName,
        views: video.views,
        channelSubscribers: channel.subscribers,
        outlierScore: Math.round(ratio * 100) / 100,
        thumbnailUrl: video.thumbnailUrl,
      });
    }
  }

  outlierExamples.sort((a, b) => b.outlierScore - a.outlierScore);

  return {
    ...niche,
    legacySignalScore: computeLegacySignalScore(outlierRatios, channelSubs),
    competitionLevel: computeCompetitionLevel(channelSubs),
    sampleSize: outlierRatios.length,
    exampleOutliers: outlierExamples.slice(0, 3),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(channelStarterDiscoverSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const workspace = await resolveWorkspaceId(parsed.data.workspaceId);
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    // 1. Generate niche ideas with Gemini (check cache first)
    const discoverHash = hashInputs("discover", parsed.data.profile);
    const cachedDiscover = await getCachedAiResponse(discoverHash, "discover");
    let rawNiches: RawNiche[];
    if (cachedDiscover) {
      rawNiches = JSON.parse(cachedDiscover).niches;
    } else {
      const result = await discoverNiches(parsed.data.profile);
      rawNiches = result.niches;
      if (rawNiches.length > 0) {
        await setCachedAiResponse(discoverHash, "discover", JSON.stringify(result));
      }
    }
    if (rawNiches.length === 0) {
      return NextResponse.json(
        { error: "Failed to generate niche suggestions" },
        { status: 500 }
      );
    }

    // 2. Measure each niche against real YouTube search results, 6 at a time.
    //    A niche whose search fails is reported by name rather than dropped or
    //    given an invented score.
    const contentFilter = parsed.data.profile?.contentType ?? "both";
    const validatedNiches: NicheSuggestion[] = [];
    const unvalidated: { name: string; reason: string }[] = [];
    for (let i = 0; i < rawNiches.length; i += 6) {
      const batch = rawNiches.slice(i, i + 6);
      const results = await Promise.allSettled(
        batch.map((niche) => validateNiche(niche, contentFilter))
      );
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          validatedNiches.push(result.value);
        } else {
          console.error(
            `Failed to validate niche "${batch[index].name}":`,
            result.reason
          );
          unvalidated.push({
            name: batch[index].name,
            reason:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          });
        }
      });
    }

    if (validatedNiches.length === 0) {
      return NextResponse.json(
        {
          error: `No niche could be measured against YouTube. First failure: ${unvalidated[0]?.reason ?? "unknown"}`,
        },
        { status: 502 }
      );
    }

    // 3. Highest measured signal first; unmeasured niches go last.
    validatedNiches.sort(
      (a, b) => (b.legacySignalScore ?? -1) - (a.legacySignalScore ?? -1)
    );

    // 4. Save to DB
    const profile = parsed.data.profile;
    const discovery = await prisma.nicheDiscovery.create({
      data: {
        workspaceId: workspace.workspaceId,
        interests: profile ? JSON.stringify(profile.interests) : null,
        skills: profile ? JSON.stringify(profile.skills) : null,
        constraints: profile ? JSON.stringify(profile.constraints) : null,
        goals: profile ? JSON.stringify(profile.goals) : null,
        contentType: profile?.contentType ?? null,
        niches: JSON.stringify(validatedNiches),
        completedStep: 2,
      },
    });

    return NextResponse.json({
      niches: validatedNiches,
      unvalidated,
      discoveryId: discovery.id,
    });
  } catch (error) {
    console.error("Channel starter discover error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to discover niches",
      },
      { status: 500 }
    );
  }
}
