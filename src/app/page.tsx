"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFolders } from "@/hooks/use-folders";
import { usePanels } from "@/hooks/use-panels";
import { useWorkspace } from "@/hooks/use-workspace";
import { ArrowRight, FolderOpen, FlaskConical, Search, Sparkles } from "lucide-react";

function WorkspaceRequired() {
  return (
    <Card><CardContent className="py-10 text-center space-y-3">
      <p className="font-medium">Choose a channel workspace to begin.</p>
      <p className="text-sm text-muted-foreground">Research is always scoped to one planned or active channel.</p>
      <Link href="/workspaces" className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">Manage channel workspaces</Link>
    </CardContent></Card>
  );
}

export default function OverviewPage() {
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const { folders, loading: foldersLoading } = useFolders();
  const { panels, loading: panelsLoading } = usePanels();

  return <div className="p-8 max-w-6xl mx-auto space-y-7 animate-fade-in-up">
    <div className="border-b border-border pb-6">
      <Badge variant="outline" className="mb-3 border-primary/30 text-primary">Channel workspace</Badge>
      <h1 className="text-3xl font-bold tracking-tight">{activeWorkspace?.name ?? "Overview"}</h1>
      <p className="text-muted-foreground mt-1 max-w-2xl">{activeWorkspace?.concept || "Decide what to research next from public evidence—not invented opportunity scores."}</p>
    </div>

    {!workspaceLoading && !activeWorkspace ? <WorkspaceRequired /> : <>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Current opportunities</p><p className="mt-2 text-3xl font-semibold tabular-nums">{panelsLoading ? "—" : panels.length}</p><p className="mt-1 text-xs text-muted-foreground">Saved topic searches</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Saved evidence</p><p className="mt-2 text-3xl font-semibold tabular-nums">{foldersLoading ? "—" : folders.reduce((total, folder) => total + folder._count.videos, 0)}</p><p className="mt-1 text-xs text-muted-foreground">Videos in idea folders</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Active research</p><p className="mt-2 text-3xl font-semibold">Manual</p><p className="mt-1 text-xs text-muted-foreground">Research jobs arrive in Stage 7</p></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-primary/25"><CardHeader><FlaskConical className="h-5 w-5 text-primary mb-2"/><CardTitle>Validate an opportunity</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground mb-4">Check a video against comparable channel uploads, search a topic, or inspect supporting evidence.</p><Link href="/opportunity-lab" className="inline-flex items-center text-sm font-medium text-primary">Open Opportunity Lab <ArrowRight className="ml-1 h-4 w-4"/></Link></CardContent></Card>
        <Card><CardHeader><Sparkles className="h-5 w-5 text-primary mb-2"/><CardTitle>Organize evidence</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground mb-4">Keep the evidence worth revisiting in workspace folders. Codex research and idea development are introduced in Milestone C.</p><Link href="/ideas" className="inline-flex items-center text-sm font-medium text-primary">Open Ideas <ArrowRight className="ml-1 h-4 w-4"/></Link></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Recently monitored evidence</CardTitle><Search className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent>{panels.length ? <div className="space-y-2">{panels.slice(0, 4).map(panel => <Link href="/outlier-finder" key={panel.id} className="block rounded-md border border-border/60 p-3 hover:bg-muted/40"><p className="text-sm font-medium">{panel.name}</p><p className="text-xs text-muted-foreground">{panel.keyword} · {panel.lastRefreshed ? `checked ${new Date(panel.lastRefreshed).toLocaleDateString()}` : "not refreshed"}</p></Link>)}</div> : <p className="text-sm text-muted-foreground">No saved topic searches yet.</p>}</CardContent></Card>
        <Card><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">Shortlisted evidence</CardTitle><FolderOpen className="h-4 w-4 text-muted-foreground"/></CardHeader><CardContent>{folders.length ? <div className="space-y-2">{folders.slice(0, 4).map(folder => <Link href={`/folders?id=${folder.id}`} key={folder.id} className="block rounded-md border border-border/60 p-3 hover:bg-muted/40"><p className="text-sm font-medium">{folder.name}</p><p className="text-xs text-muted-foreground">{folder._count.videos} saved video(s)</p></Link>)}</div> : <p className="text-sm text-muted-foreground">Save evidence from Opportunity Lab to start a shortlist.</p>}</CardContent></Card>
      </div>
    </>}
  </div>;
}
