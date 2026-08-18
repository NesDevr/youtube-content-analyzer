import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, referenceSaveSchema, REFERENCE_USES } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

/**
 * Reference collections for one workspace, plus the vocabulary the save form
 * must use. The list of uses is validated on this side, so it is served from
 * here rather than repeated in the page.
 */
export async function GET(req: NextRequest) {
  const workspace = await resolveWorkspaceId(req.nextUrl.searchParams.get("workspaceId"));
  if (!workspace.ok) return NextResponse.json({ error: workspace.error }, { status: workspace.status });

  const collections = await prisma.referenceCollection.findMany({
    where: { workspaceId: workspace.workspaceId },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { addedAt: "asc" } } },
  });
  const workspaces = await prisma.channelWorkspace.findMany({
    where: { status: { not: "archived" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ collections, workspaces, uses: REFERENCE_USES });
}

/**
 * Saves a selection as a named collection in every workspace it was addressed
 * to. Re-saving the same name adds to that collection instead of creating a
 * second one, and a video already kept for the same reason is left alone.
 */
export async function POST(req: NextRequest) {
  const parsed = parseBody(referenceSaveSchema, await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { workspaceIds, name, question, items } = parsed.data;

  const targets = await prisma.channelWorkspace.findMany({
    where: { id: { in: workspaceIds }, status: { not: "archived" } },
    select: { id: true, name: true },
  });
  const missing = workspaceIds.filter((id) => !targets.some((target) => target.id === id));
  if (missing.length) {
    return NextResponse.json(
      { error: `No active workspace with id ${missing.join(", ")}.` },
      { status: 404 }
    );
  }

  const saved = [];
  for (const target of targets) {
    const collection = await prisma.referenceCollection.upsert({
      where: { workspaceId_name: { workspaceId: target.id, name } },
      create: { workspaceId: target.id, name, question: question ?? "" },
      update: question === undefined ? {} : { question },
      select: { id: true },
    });

    let added = 0;
    for (const item of items) {
      const existing = await prisma.referenceItem.findUnique({
        where: {
          collectionId_videoId_use: {
            collectionId: collection.id,
            videoId: item.videoId,
            use: item.use,
          },
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.referenceItem.create({
        data: {
          collectionId: collection.id,
          videoId: item.videoId,
          title: item.title,
          channelId: item.channelId,
          channelName: item.channelName,
          thumbnailUrl: item.thumbnailUrl,
          views: item.views,
          publishedAt: new Date(item.publishedAt),
          format: item.format,
          language: item.language ?? "",
          region: item.region ?? "",
          sourceQuery: item.sourceQuery ?? "",
          use: item.use,
          note: item.note ?? "",
        },
      });
      added += 1;
    }

    saved.push({
      workspaceId: target.id,
      workspaceName: target.name,
      collectionId: collection.id,
      added,
      alreadyPresent: items.length - added,
    });
  }

  return NextResponse.json({ saved });
}
