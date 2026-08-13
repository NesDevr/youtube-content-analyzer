import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOutliers } from "@/lib/youtube";
import { panelActionSchema, parseBody } from "@/lib/validation";
import { resolveWorkspaceId } from "@/lib/workspace";

function getDateRange(preset: string): { after?: string } {
  if (!preset) return {};
  const now = new Date();
  const map: Record<string, number> = {
    "7d": 7,
    "30d": 30,
    "3m": 90,
    "6m": 180,
    "1y": 365,
    "2y": 730,
  };
  const days = map[preset] || 0;
  if (!days) return {};
  const after = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { after: after.toISOString() };
}

interface PanelFilters {
  maxSubscribers?: number | null;
  minViews?: number | null;
  minDuration?: number | null;
  maxDuration?: number | null;
  minEngagement?: number | null;
  datePreset?: string;
  language?: string;
  sortBy?: string;
  excludeShorts?: boolean;
}

async function runSearch(keyword: string, filters: PanelFilters) {
  const dateRange = getDateRange(filters.datePreset || "");
  return findOutliers({
    keyword,
    maxSubscribers: filters.maxSubscribers ?? undefined,
    minViews: filters.minViews ?? undefined,
    minDuration: filters.minDuration ?? undefined,
    maxDuration: filters.maxDuration ?? undefined,
    minEngagement: filters.minEngagement ?? undefined,
    publishedAfter: dateRange.after,
    language: filters.language || undefined,
    excludeShorts: filters.excludeShorts,
    maxResults: 50,
  });
}

// GET /api/panels?workspaceId=1 — saved searches for one workspace
export async function GET(req: NextRequest) {
  try {
    const workspace = await resolveWorkspaceId(
      req.nextUrl.searchParams.get("workspaceId")
    );
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    const panels = await prisma.panel.findMany({
      where: { workspaceId: workspace.workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ panels });
  } catch (error) {
    console.error("Panels error:", error);
    return NextResponse.json({ error: "Failed to fetch panels" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(panelActionSchema, body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const data = parsed.data;

    const workspace = await resolveWorkspaceId(data.workspaceId);
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }
    const { workspaceId } = workspace;

    if (data.action === "create") {
      const panel = await prisma.panel.create({
        data: {
          name: data.name.trim(),
          keyword: data.keyword.trim(),
          workspaceId,
          filters: JSON.stringify(data.filters || {}),
          results: JSON.stringify(data.results || []),
        },
      });
      return NextResponse.json({ panel });
    }

    if (data.action === "refresh") {
      const panel = await prisma.panel.findFirst({
        where: { id: data.id, workspaceId },
      });
      if (!panel) {
        return NextResponse.json(
          { error: `Panel ${data.id} not found in workspace ${workspaceId}` },
          { status: 404 }
        );
      }
      const filters: PanelFilters = JSON.parse(panel.filters);
      const results = await runSearch(panel.keyword, filters);
      const updated = await prisma.panel.update({
        where: { id: data.id },
        data: {
          results: JSON.stringify(results),
          lastRefreshed: new Date(),
        },
      });
      return NextResponse.json({ panel: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Panel action error:", error);
    return NextResponse.json({ error: "Panel operation failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const workspace = await resolveWorkspaceId(
      req.nextUrl.searchParams.get("workspaceId")
    );
    if (!workspace.ok) {
      return NextResponse.json({ error: workspace.error }, { status: workspace.status });
    }

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
    const parsedId = parseInt(id);
    if (Number.isNaN(parsedId)) {
      return NextResponse.json({ error: "Invalid panel ID" }, { status: 400 });
    }

    const panel = await prisma.panel.findFirst({
      where: { id: parsedId, workspaceId: workspace.workspaceId },
      select: { id: true },
    });
    if (!panel) {
      return NextResponse.json(
        { error: `Panel ${parsedId} not found in workspace ${workspace.workspaceId}` },
        { status: 404 }
      );
    }

    await prisma.panel.delete({ where: { id: parsedId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete panel error:", error);
    return NextResponse.json({ error: "Failed to delete panel" }, { status: 500 });
  }
}
