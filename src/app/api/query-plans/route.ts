import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, queryPlanActionSchema } from "@/lib/validation";
import { planningContext, suggestQueries, validatePlanRows } from "@/lib/query-plans";

export async function GET(req: NextRequest) {
  const workspaceId = Number(req.nextUrl.searchParams.get("workspaceId"));
  if (!Number.isInteger(workspaceId) || workspaceId < 1) return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  const [profile, plans] = await Promise.all([
    prisma.channelResearchProfile.findUnique({ where: { workspaceId } }),
    prisma.queryPlan.findMany({ where: { workspaceId }, include: { queries: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  return NextResponse.json({ profile, plans });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = parseBody(queryPlanActionSchema, await req.json()); if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 }); const data = parsed.data;
    const workspace = await prisma.channelWorkspace.findUnique({ where: { id: data.workspaceId } }); if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    if (data.action === "saveProfile") {
      const { action: _action, workspaceId, ...fields } = data;
      void _action;
      const profile = await prisma.channelResearchProfile.upsert({ where: { workspaceId }, create: { workspaceId, ...fields }, update: fields });
      return NextResponse.json({ profile });
    }
    if (data.action === "updateQueries") { const plan = await prisma.queryPlan.findFirst({ where: { id: data.planId, workspaceId: data.workspaceId } }); if (!plan) return NextResponse.json({ error: "Query plan not found" }, { status: 404 }); const rows = validatePlanRows(data.queries); if (rows.length !== data.queries.length) return NextResponse.json({ error: "Every search must be unique, at least 3 characters, and about what a viewer searches for." }, { status: 400 }); await prisma.$transaction([prisma.queryPlanQuery.deleteMany({ where: { queryPlanId: plan.id } }), prisma.queryPlanQuery.createMany({ data: rows.map((row, position) => ({ queryPlanId: plan.id, position, query: row.query, purpose: row.purpose, mechanism: row.mechanism ?? "", expectedEvidence: row.expectedEvidence ?? "", sourceContext: row.sourceContext ?? "", language: row.language ?? "", region: row.region ?? "", generationReason: row.generationReason ?? "", selected: row.selected ?? true })) })]); return NextResponse.json({ ok: true }); }

    // Suggestions are built from the typed question only; the workspace supplies
    // just the language and region every suggestion is scoped to.
    const context = await planningContext(data.workspaceId);
    const rows = suggestQueries(data.question, context.workspace.language, context.workspace.country);
    const plan = await prisma.queryPlan.create({ data: { workspaceId: data.workspaceId, inputs: JSON.stringify({ question: data.question, workspace: context.workspace }), provider: "none", model: "", manualPrompt: data.question, queries: { create: rows.map((row, position) => ({ position, query: row.query, purpose: row.purpose, mechanism: row.mechanism ?? "", expectedEvidence: row.expectedEvidence ?? "", sourceContext: row.sourceContext ?? "", language: row.language ?? "", region: row.region ?? "", generationReason: row.generationReason ?? "", selected: true })) } }, include: { queries: { orderBy: { position: "asc" } } } });
    return NextResponse.json({ plan });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not suggest searches" }, { status: 400 }); }
}
