import { NextRequest, NextResponse } from "next/server";
import { videoAnalyzerSchema, parseBody } from "@/lib/validation";
import { extractVideoIds, fetchTranscript } from "@/lib/transcript";
import { getVideoDetails, getChannelStats } from "@/lib/youtube";
import { deepAnalyzeVideos, generateInspiredIdeas } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(videoAnalyzerSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const videoIds = extractVideoIds(parsed.data.urls);
    if (videoIds.length === 0) {
      return NextResponse.json(
        { error: "No valid YouTube video URLs or IDs found" },
        { status: 400 }
      );
    }
    if (videoIds.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 videos allowed per analysis" },
        { status: 400 }
      );
    }

    const errors: string[] = [];

    // 1. Fetch video metadata
    const videoResults = await getVideoDetails(videoIds);
    const foundIds = new Set(videoResults.map((v) => v.id));
    for (const id of videoIds) {
      if (!foundIds.has(id)) {
        errors.push(`Video ${id}: not found on YouTube`);
      }
    }

    if (videoResults.length === 0) {
      return NextResponse.json(
        { error: "None of the provided videos could be found" },
        { status: 404 }
      );
    }

    // 2. Fetch channel stats
    const channelIds = videoResults.map((v) => v.channelId);
    const channelStats = await getChannelStats(channelIds);

    // 3. Fetch transcripts (sequential to avoid rate limits)
    const transcripts = new Map<string, string | null>();
    for (const video of videoResults) {
      const result = await fetchTranscript(video.id);
      transcripts.set(video.id, result.transcript);
      if (result.error) {
        errors.push(`Video "${video.title}": ${result.error}`);
      }
    }

    // 4. Build data for Gemini
    const videosForAnalysis = videoResults.map((v) => {
      const channel = channelStats.get(v.channelId);
      return {
        title: v.title,
        channelName: v.channelName,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        duration: v.duration,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        transcript: transcripts.get(v.id) ?? null,
        channelSubscribers: channel?.subscribers ?? v.channelSubscribers,
      };
    });

    // 5. Deep analysis
    const analysisResult = await deepAnalyzeVideos(videosForAnalysis);

    // 6. Generate inspired ideas
    const inspirationResult = await generateInspiredIdeas(analysisResult.analyses);

    // 7. Save to DB
    await prisma.videoAnalysis.create({
      data: {
        videoIds: videoIds.join(","),
        analysisResult: JSON.stringify(analysisResult.analyses),
        inspirations: JSON.stringify(inspirationResult.ideas),
      },
    });

    // 8. Return response
    return NextResponse.json({
      videos: videoResults.map((v) => ({
        id: v.id,
        title: v.title,
        channelName: v.channelName,
        views: v.views,
        thumbnailUrl: v.thumbnailUrl,
        hasTranscript: transcripts.get(v.id) != null,
      })),
      analyses: analysisResult.analyses,
      inspirations: inspirationResult.ideas,
      errors,
    });
  } catch (error) {
    console.error("Video analyzer error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to analyze videos",
      },
      { status: 500 }
    );
  }
}
