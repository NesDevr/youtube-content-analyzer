"use client";

/** The channel's ideas: add one, edit one, and choose which becomes the current video. */

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceRequired } from "@/components/workspace-required";
import { useWorkspace } from "@/hooks/use-workspace";

interface Idea {
  id: number;
  title: string;
  audiencePromise: string;
  angle: string;
  risks: string;
  status: string;
  rejectionReason: string;
  rank: number;
  selectedPackage: string;
  rejectedPackages: string;
  researchBrief: string;
  researchJob: { id: number; intent: string } | null;
}

const STATUSES = ["inbox", "shortlisted", "researching", "selected", "rejected", "produced", "published"];

export default function IdeasPage() {
  const { workspaceId, activeWorkspace, workspaces, loading: workspaceLoading } = useWorkspace();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (workspaceId === null) return;
    try {
      const res = await fetch(`/api/ideas?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error("Could not load the ideas in this workspace");
      setIdeas((await res.json()).ideas);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the ideas in this workspace");
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(idea: Idea, fields: Partial<Idea> & { destinationWorkspaceId?: number }) {
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", workspaceId, id: idea.id, ...fields }),
    });
    const body = await res.json();
    if (!res.ok) toast.error(body.error || "Could not update the idea");
    else await load();
  }

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", workspaceId, title: title.trim() }),
    });
    const body = await res.json();
    if (!res.ok) toast.error(body.error || "Could not add the idea");
    else {
      setTitle("");
      await load();
    }
    setBusy(false);
  }

  /** Only one idea is the current video, so the previous one returns to the shortlist. */
  async function makeCurrent(idea: Idea) {
    setBusy(true);
    const current = ideas.find((item) => item.status === "selected" && item.id !== idea.id);
    if (current) await save(current, { status: "shortlisted" });
    await save(idea, { status: "selected" });
    toast.success("This is now the current video.");
    setBusy(false);
  }

  function parsePackages(idea: Idea) {
    try {
      return JSON.parse(idea.rejectedPackages) as Array<{ title: string; thumbnailDirection: string; transferableMechanism: string; distinctExecution: string; flags: string[] }>;
    } catch {
      return [];
    }
  }

  if (workspaceLoading) return null;
  if (workspaceId === null)
    return (
      <main className="mx-auto max-w-4xl p-8">
        <WorkspaceRequired action="keep ideas" />
      </main>
    );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 animate-fade-in-up">
      <header className="space-y-2 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Ideas · {activeWorkspace?.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">What this channel could make</h1>
      </header>

      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && create()}
          placeholder="Add an idea — one line is enough"
        />
        <Button disabled={busy || !title.trim()} onClick={create}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {ideas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Lightbulb className="mx-auto mb-2 h-5 w-5" />
            No ideas yet. Add one above, or save references first and come back with what you saw.
          </CardContent>
        </Card>
      ) : (
        [...ideas]
          .sort((a, b) => a.rank - b.rank)
          .map((idea) => {
            const packages = parsePackages(idea);
            return (
              <Card key={idea.id} className={idea.status === "selected" ? "border-primary/40" : undefined}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label={`Title for ${idea.title}`}
                      className="h-8 border-0 px-0 text-base font-medium"
                      value={idea.title}
                      onChange={(event) => setIdeas((all) => all.map((item) => (item.id === idea.id ? { ...item, title: event.target.value } : item)))}
                      onBlur={(event) => event.target.value.trim() && save(idea, { title: event.target.value.trim() })}
                    />
                    <CardDescription>
                      {idea.status === "selected" ? "This is the current video." : idea.status}
                      {idea.researchJob && ` · from research request #${idea.researchJob.id}`}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {idea.status !== "selected" && (
                      <Button size="sm" disabled={busy} onClick={() => makeCurrent(idea)}>
                        Make current video
                      </Button>
                    )}
                    <select
                      aria-label={`Status for ${idea.title}`}
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                      value={idea.status}
                      onChange={(event) =>
                        save(idea, {
                          status: event.target.value,
                          ...(event.target.value === "rejected" && !idea.rejectionReason ? { rejectionReason: "Rejected after review" } : {}),
                        })
                      }
                    >
                      {STATUSES.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </CardHeader>
                <CardContent>
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <Textarea
                          aria-label={`Audience promise for ${idea.title}`}
                          placeholder="Audience promise"
                          value={idea.audiencePromise}
                          onChange={(event) => setIdeas((all) => all.map((item) => (item.id === idea.id ? { ...item, audiencePromise: event.target.value } : item)))}
                          onBlur={(event) => save(idea, { audiencePromise: event.target.value })}
                        />
                        <Textarea
                          aria-label={`Angle for ${idea.title}`}
                          placeholder="Original angle"
                          value={idea.angle}
                          onChange={(event) => setIdeas((all) => all.map((item) => (item.id === idea.id ? { ...item, angle: event.target.value } : item)))}
                          onBlur={(event) => save(idea, { angle: event.target.value })}
                        />
                        <Textarea
                          aria-label={`Risks for ${idea.title}`}
                          placeholder="Risks, weak sources, copyright or derivative concerns"
                          value={idea.risks}
                          onChange={(event) => setIdeas((all) => all.map((item) => (item.id === idea.id ? { ...item, risks: event.target.value } : item)))}
                          onBlur={(event) => save(idea, { risks: event.target.value })}
                        />
                        <Textarea
                          aria-label={`Rejection reason for ${idea.title}`}
                          placeholder="Rejection reason"
                          value={idea.rejectionReason}
                          onChange={(event) => setIdeas((all) => all.map((item) => (item.id === idea.id ? { ...item, rejectionReason: event.target.value } : item)))}
                          onBlur={(event) => save(idea, { rejectionReason: event.target.value })}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Label>
                          <span className="mr-2 text-xs text-muted-foreground">Order</span>
                          <Input
                            className="inline-block w-20"
                            aria-label={`Rank for ${idea.title}`}
                            type="number"
                            value={idea.rank}
                            onChange={(event) => setIdeas((all) => all.map((item) => (item.id === idea.id ? { ...item, rank: Number(event.target.value) } : item)))}
                            onBlur={(event) => save(idea, { rank: Number(event.target.value) })}
                          />
                        </Label>
                        <select
                          aria-label={`Move ${idea.title}`}
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          defaultValue=""
                          onChange={(event) => event.target.value && save(idea, { destinationWorkspaceId: Number(event.target.value) })}
                        >
                          <option value="">Move to another channel…</option>
                          {workspaces
                            .filter((workspace) => workspace.id !== workspaceId && workspace.status !== "archived")
                            .map((workspace) => (
                              <option key={workspace.id} value={workspace.id}>
                                {workspace.name}
                              </option>
                            ))}
                        </select>
                      </div>

                      {packages.length > 0 && (
                        <div className="space-y-2 rounded-md border p-3">
                          <p className="text-sm font-medium">Title and thumbnail packages</p>
                          {packages.map((item, index) => (
                            <div key={`${item.title}-${index}`} className="border-t pt-2 text-sm">
                              <p className="font-medium">{item.title}</p>
                              <p>{item.thumbnailDirection}</p>
                              <p className="text-muted-foreground">
                                Mechanism: {item.transferableMechanism}. Distinct execution: {item.distinctExecution}.
                              </p>
                              {item.flags.length > 0 && <p className="text-destructive">Flags: {item.flags.join(", ")}</p>}
                              <Button
                                size="sm"
                                variant={idea.selectedPackage === JSON.stringify(item) ? "default" : "outline"}
                                className="mt-2"
                                onClick={() => save(idea, { selectedPackage: JSON.stringify(item) })}
                              >
                                Use this package
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </details>
                </CardContent>
              </Card>
            );
          })
      )}
    </main>
  );
}
