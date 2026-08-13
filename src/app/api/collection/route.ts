import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { discover, quotaSummary, refreshTrackedChannel, velocityFromSnapshots } from "@/lib/collection";
import { collectionActionSchema, parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  try {
    const [quota, trackedChannels, jobs] = await Promise.all([
      quotaSummary(),
      prisma.trackedChannel.findMany({ where: { workspaceId: workspace.workspaceId }, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
      prisma.collectionJob.findMany({ where: { workspaceId: workspace.workspaceId }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const videoIds = (await prisma.videoSnapshot.findMany({ where: { channelId: { in: trackedChannels.map((track) => track.channelId) } }, distinct: ["videoId"], select: { videoId: true } })).map((row) => row.videoId);
    const snapshots = videoIds.length ? await prisma.videoSnapshot.findMany({ where: { videoId: { in: videoIds } }, orderBy: { collectedAt: "desc" } }) : [];
    const velocity = new Map<string, ReturnType<typeof velocityFromSnapshots>>();
    for (const snapshot of snapshots) {
      const values = snapshots.filter((candidate) => candidate.videoId === snapshot.videoId);
      if (!velocity.has(snapshot.videoId)) velocity.set(snapshot.videoId, velocityFromSnapshots(values));
    }
    return NextResponse.json({ quota, trackedChannels, jobs, velocity: [...velocity.entries()].map(([videoId, measurement]) => ({ videoId, measurement })) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load collection status" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = parseBody(collectionActionSchema, await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data = parsed.data;
    const workspace = await resolveWorkspaceId(String(data.workspaceId));
    if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    if (data.action === "discover") return NextResponse.json(await discover(workspace.workspaceId, data.query, data.language, data.region));
    if (data.action === "track") {
      const trackedChannel = await prisma.trackedChannel.upsert({
        where: { workspaceId_channelId: { workspaceId: workspace.workspaceId, channelId: data.channelId } },
        create: { workspaceId: workspace.workspaceId, channelId: data.channelId, priority: data.priority, refreshSchedule: data.refreshSchedule },
        update: { priority: data.priority, refreshSchedule: data.refreshSchedule },
      });
      return NextResponse.json({ trackedChannel });
    }
    if (data.action === "refresh") return NextResponse.json(await refreshTrackedChannel(workspace.workspaceId, data.trackedChannelId));
    if (data.manualReserve >= data.dailyBudget) return NextResponse.json({ error: "Manual reserve must be lower than the daily budget." }, { status: 400 });
    const policy = await prisma.quotaPolicy.upsert({
      where: { id: 1 },
      create: { id: 1, dailyBudget: data.dailyBudget, manualReserve: data.manualReserve, searchCacheHours: data.searchCacheHours },
      update: { dailyBudget: data.dailyBudget, manualReserve: data.manualReserve, searchCacheHours: data.searchCacheHours },
    });
    return NextResponse.json({ policy });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Collection operation failed" }, { status: 500 });
  }
}
