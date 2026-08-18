import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ANALYSIS_MAX_COST,
  discover,
  DISCOVERY_MAX_COST,
  expandSeed,
  MAX_SET_QUERIES,
  planDiscoverySet,
  pruneSnapshots,
  quotaSummary,
  QuotaBlockedError,
  refreshTrackedChannels,
  relatedEvidence,
  runDiscoverySet,
  trackedGrowth,
  UPLOADS_COLLECTION_COST,
} from "@/lib/collection";
import { collectionActionSchema, parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

/** A blocked budget is the expected answer to a request, not a server fault. */
function failure(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: error instanceof QuotaBlockedError ? 429 : 500 });
}

export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  try {
    const [quota, trackedChannels, jobs, growth, searches] = await Promise.all([
      quotaSummary(),
      prisma.trackedChannel.findMany({
        where: { workspaceId: workspace.workspaceId },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      }),
      prisma.collectionJob.findMany({
        where: { workspaceId: workspace.workspaceId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          quotaEvents: {
            select: { endpoint: true, expectedCost: true, actualCost: true, result: true, error: true },
          },
        },
      }),
      trackedGrowth(workspace.workspaceId),
      prisma.discoverySearch.findMany({
        where: { workspaceId: workspace.workspaceId },
        orderBy: { collectedAt: "desc" },
        take: 5,
        select: { id: true, query: true, scope: true, collectedAt: true, expiresAt: true },
      }),
    ]);

    return NextResponse.json({
      quota,
      trackedChannels,
      growth,
      searches,
      // Enforced by the engine; sent so the page states the same bound and price
      // the server will apply instead of keeping its own copy.
      limits: {
        maxSetQueries: MAX_SET_QUERIES,
        discoveryMaxCost: DISCOVERY_MAX_COST,
        uploadsCollectionCost: UPLOADS_COLLECTION_COST,
        analysisMaxCost: ANALYSIS_MAX_COST,
      },
      jobs: jobs.map((job) => ({
        id: job.id,
        kind: job.kind,
        status: job.status,
        scope: job.scope,
        result: job.result,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
        quotaUnits: job.quotaEvents.reduce(
          (sum, event) => sum + (event.result === "pending" ? event.expectedCost : event.actualCost ?? 0),
          0
        ),
        quotaEvents: job.quotaEvents,
      })),
    });
  } catch (error) {
    return failure(error, "Could not load collection status");
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = parseBody(collectionActionSchema, await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const data = parsed.data;
    const workspace = await resolveWorkspaceId(String(data.workspaceId));
    if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });

    if (data.action === "discover") {
      return NextResponse.json(await discover(workspace.workspaceId, data));
    }
    if (data.action === "planSet") {
      return NextResponse.json({ plan: await planDiscoverySet(workspace.workspaceId, data.queries) });
    }
    if (data.action === "discoverSet") {
      return NextResponse.json(await runDiscoverySet(workspace.workspaceId, data.queries));
    }
    if (data.action === "related") {
      return NextResponse.json(await relatedEvidence(workspace.workspaceId, data));
    }
    if (data.action === "expand") {
      return NextResponse.json(await expandSeed(workspace.workspaceId, data.channelId));
    }
    if (data.action === "prune") {
      return NextResponse.json({ retention: await pruneSnapshots() });
    }
    if (data.action === "track") {
      const trackedChannel = await prisma.trackedChannel.upsert({
        where: { workspaceId_channelId: { workspaceId: workspace.workspaceId, channelId: data.channelId } },
        create: {
          workspaceId: workspace.workspaceId,
          channelId: data.channelId,
          priority: data.priority,
          refreshSchedule: data.refreshSchedule,
        },
        update: { priority: data.priority, refreshSchedule: data.refreshSchedule },
      });
      return NextResponse.json({ trackedChannel });
    }
    if (data.action === "refresh") {
      return NextResponse.json(
        await refreshTrackedChannels(workspace.workspaceId, data.trackedChannelId)
      );
    }

    if (data.manualReserve >= data.dailyBudget) {
      return NextResponse.json(
        { error: "Manual reserve must be lower than the daily budget." },
        { status: 400 }
      );
    }
    const fields = {
      dailyBudget: data.dailyBudget,
      manualReserve: data.manualReserve,
      searchCacheHours: data.searchCacheHours,
      snapshotThinAfterDays: data.snapshotThinAfterDays,
    };
    const policy = await prisma.quotaPolicy.upsert({
      where: { id: 1 },
      create: { id: 1, ...fields },
      update: fields,
    });
    return NextResponse.json({ policy });
  } catch (error) {
    return failure(error, "Collection operation failed");
  }
}
