import { NextRequest, NextResponse } from "next/server";
import { channelStarterDiscoverSchema, parseBody } from "@/lib/validation";
import { discoverNiches } from "@/lib/channel-starter";
import {
  searchVideos,
  getVideoDetails,
  getChannelStats,
} from "@/lib/youtube";
import { getInterestOverTime } from "@/lib/trends";
import { prisma } from "@/lib/prisma";
import { hashInputs, getCachedAiResponse, setCachedAiResponse } from "@/lib/ai-cache";
import type { NicheSuggestion, RawNiche } from "@/types/channel-starter";

function computeOpportunityScore(
  outlierScores: number[],
  channelSubs: number[],
  trendDirection: "rising" | "stable" | "declining"
): number {
  if (outlierScores.length === 0) return 20;

  // Outlier density: % of videos with outlier score >= 5x
  const outlierDensity = outlierScores.filter((s) => s >= 5).length / outlierScores.length;

  // Average outlier score of top 10
  const sorted = [...outlierScores].sort((a, b) => b - a);
  const top10 = sorted.slice(0, 10);
  const avgOutlierScore = top10.reduce((a, b) => a + b, 0) / top10.length;
  const normalizedOutlier = Math.min(avgOutlierScore / 20, 1); // Cap at 20x

  // Trend momentum
  const trendScore =
    trendDirection === "rising" ? 1 : trendDirection === "stable" ? 0.5 : 0.2;

  // Small channel success: % of channels under 50k subs
  const smallChannelRatio =
    channelSubs.length > 0
      ? channelSubs.filter((s) => s < 50000).length / channelSubs.length
      : 0.5;

  const raw =
    outlierDensity * 0.35 +
    normalizedOutlier * 0.25 +
    trendScore * 0.2 +
    smallChannelRatio * 0.2;

  return Math.round(raw * 100);
}

function computeCompetitionLevel(
  channelSubs: number[]
): "low" | "medium" | "high" {
  if (channelSubs.length === 0) return "medium";
  const sorted = [...channelSubs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median < 100000) return "low";
  if (median < 500000) return "medium";
  return "high";
}

function computeTrendDirection(
  trendData: { date: string; value: number }[]
): "rising" | "stable" | "declining" {
  if (trendData.length < 6) return "stable";
  const mid = Math.floor(trendData.length / 2);
  const recentHalf = trendData.slice(mid);
  const olderHalf = trendData.slice(0, mid);

  const recentAvg =
    recentHalf.reduce((a, b) => a + b.value, 0) / recentHalf.length;
  const olderAvg =
    olderHalf.reduce((a, b) => a + b.value, 0) / olderHalf.length;

  if (olderAvg === 0) return "stable";
  const change = (recentAvg - olderAvg) / olderAvg;
  if (change > 0.2) return "rising";
  if (change < -0.2) return "declining";
  return "stable";
}

async function validateNiche(
  niche: RawNiche,
  contentFilter?: "long-form" | "short-form" | "shorts" | "both"
): Promise<NicheSuggestion | null> {
  try {
    const primaryKeyword = niche.searchKeywords[0];
    if (!primaryKeyword) return null;

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
        opportunityScore: 30,
        competitionLevel: "medium",
        trendDirection: "stable",
        trendData: [],
        exampleOutliers: [],
      };
    }

    // Get video details + channel stats
    let videos = await getVideoDetails(videoIds.slice(0, 20));

    const channelIds = videos.map((v) => v.channelId);
    const channelStats = await getChannelStats(channelIds);

    // Compute outlier scores
    const outlierScores: number[] = [];
    const channelSubs: number[] = [];
    const outlierExamples: NicheSuggestion["exampleOutliers"] = [];

    for (const video of videos) {
      const channel = channelStats.get(video.channelId);
      if (!channel) continue;

      channelSubs.push(channel.subscribers);
      const outlierScore =
        channel.averageViews > 0 ? video.views / channel.averageViews : 0;
      outlierScores.push(outlierScore);

      // Collect outlier examples from small channels
      if (channel.subscribers < 200000 && outlierScore >= 3) {
        outlierExamples.push({
          id: video.id,
          title: video.title,
          channelName: video.channelName,
          views: video.views,
          channelSubscribers: channel.subscribers,
          outlierScore: Math.round(outlierScore * 100) / 100,
          thumbnailUrl: video.thumbnailUrl,
        });
      }
    }

    // Sort outlier examples by score and take top 3
    outlierExamples.sort((a, b) => b.outlierScore - a.outlierScore);
    const topOutliers = outlierExamples.slice(0, 3);

    // Get trend data
    let trendData: { date: string; value: number }[] = [];
    let trendDirection: "rising" | "stable" | "declining" = "stable";
    try {
      const trends = await getInterestOverTime([primaryKeyword], "today 12-m");
      if (trends[0]?.data) {
        trendData = trends[0].data;
        trendDirection = computeTrendDirection(trendData);
      }
      // Small delay to avoid trends rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // Trends failed — use defaults
    }

    const opportunityScore = computeOpportunityScore(
      outlierScores,
      channelSubs,
      trendDirection
    );
    const competitionLevel = computeCompetitionLevel(channelSubs);

    return {
      ...niche,
      opportunityScore,
      competitionLevel,
      trendDirection,
      trendData,
      exampleOutliers: topOutliers,
    };
  } catch (error) {
    console.error(`Failed to validate niche "${niche.name}":`, error);
    return {
      ...niche,
      opportunityScore: 25,
      competitionLevel: "medium",
      trendDirection: "stable",
      trendData: [],
      exampleOutliers: [],
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(channelStarterDiscoverSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
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

    // 2. Validate each niche with YouTube + Trends data (batched 4 at a time)
    const contentFilter = parsed.data.profile?.contentType ?? "both";
    const validatedNiches: NicheSuggestion[] = [];
    for (let i = 0; i < rawNiches.length; i += 6) {
      const batch = rawNiches.slice(i, i + 6);
      const results = await Promise.all(
        batch.map((niche) => validateNiche(niche, contentFilter))
      );
      for (const result of results) {
        if (result) validatedNiches.push(result);
      }
    }

    // 3. Sort by opportunity score
    validatedNiches.sort((a, b) => b.opportunityScore - a.opportunityScore);

    // 4. Save to DB
    const profile = parsed.data.profile;
    const discovery = await prisma.nicheDiscovery.create({
      data: {
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
