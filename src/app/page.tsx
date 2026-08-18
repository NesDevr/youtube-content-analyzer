"use client";

/**
 * The current video: one selected idea and the seven steps that turn it into a
 * finished video. Notes live on the idea itself, so nothing here invents a
 * status the database does not hold.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Circle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceRequired } from "@/components/workspace-required";
import { useWorkspace } from "@/hooks/use-workspace";

interface Idea {
  id: number;
  title: string;
  status: string;
  audiencePromise: string;
  angle: string;
  production: string;
  researchBrief: string;
  updatedAt: string;
}

interface Brief {
  conclusion: string;
  claims: string[];
  counterarguments: string[];
  sources: Array<{ url: string; sourceType: string; title: string; claim: string }>;
}

/** Present only when Codex has completed a research job for this idea. */
function readBrief(idea: Idea): Brief | null {
  try {
    const parsed = JSON.parse(idea.researchBrief || "");
    return parsed && typeof parsed.conclusion === "string" ? (parsed as Brief) : null;
  } catch {
    return null;
  }
}

interface Job {
  id: number;
  status: string;
  intent: string;
  error: string | null;
  evidence: unknown[];
}

interface Stage {
  notes: string;
  done: boolean;
}

const STAGES: Array<{ key: string; label: string; hint: string; rows: number }> = [
  { key: "concept", label: "Concept", hint: "What the viewer is promised, and the angle that makes this version yours.", rows: 4 },
  { key: "references", label: "References", hint: "The titles and thumbnails you are learning from.", rows: 3 },
  { key: "packaging", label: "Title and thumbnail", hint: "The packaging you are committing to, and why it is distinct from its references.", rows: 4 },
  { key: "research", label: "Research", hint: "The facts, numbers and sources this video needs before it can be written.", rows: 6 },
  { key: "structure", label: "Structure", hint: "The order the story is told in.", rows: 6 },
  { key: "script", label: "Script", hint: "The narration, written out.", rows: 14 },
  { key: "visuals", label: "Visual plan and B-roll", hint: "What is on screen while each part is said.", rows: 8 },
];

function readStages(idea: Idea): Record<string, Stage> {
  try {
    const parsed = JSON.parse(idea.production || "{}") as Record<string, Partial<Stage>>;
    return Object.fromEntries(
      STAGES.map(({ key }) => [key, { notes: parsed[key]?.notes ?? "", done: parsed[key]?.done ?? false }])
    );
  } catch {
    return Object.fromEntries(STAGES.map(({ key }) => [key, { notes: "", done: false }]));
  }
}

export default function CurrentVideoPage() {
  const { workspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [collections, setCollections] = useState<Array<{ id: number; name: string; items: unknown[] }>>([]);
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const current = useMemo(() => ideas.find((idea) => idea.status === "selected") ?? null, [ideas]);

  const load = useCallback(async () => {
    if (workspaceId === null) return;
    try {
      const [ideaRes, jobRes, referenceRes] = await Promise.all([
        fetch(`/api/ideas?workspaceId=${workspaceId}`),
        fetch(`/api/research-jobs?workspaceId=${workspaceId}`),
        fetch(`/api/references?workspaceId=${workspaceId}`),
      ]);
      if (!ideaRes.ok || !jobRes.ok || !referenceRes.ok) throw new Error("Could not load this workspace");
      const loadedIdeas: Idea[] = (await ideaRes.json()).ideas;
      setIdeas(loadedIdeas);
      setJobs((await jobRes.json()).jobs);
      setCollections((await referenceRes.json()).collections);
      const selected = loadedIdeas.find((idea) => idea.status === "selected");
      setStages(selected ? readStages(selected) : {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load this workspace");
    } finally {
      setLoaded(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    setLoaded(false);
    load();
  }, [load]);

  async function update(id: number, fields: Record<string, unknown>) {
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", workspaceId, id, ...fields }),
    });
    const body = await res.json();
    if (!res.ok) {
      toast.error(body.error || "Could not save");
      return false;
    }
    return true;
  }

  async function saveStages(next: Record<string, Stage>) {
    if (!current) return;
    setStages(next);
    await update(current.id, { production: JSON.stringify(next) });
  }

  async function makeCurrent(idea: Idea) {
    setBusy(true);
    if (current && current.id !== idea.id) await update(current.id, { status: "shortlisted" });
    await update(idea.id, { status: "selected" });
    await load();
    setBusy(false);
  }

  async function queueResearch() {
    if (!current) return;
    setBusy(true);
    const res = await fetch("/api/research-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        workspaceId,
        intent: `Research for the video "${current.title}": ${stages.research?.notes || "what facts, numbers and sources does it need?"}`,
        seeds: [{ kind: "manual", id: `idea-${current.id}`, label: current.title, note: current.audiencePromise }],
      }),
    });
    const body = await res.json();
    if (!res.ok) toast.error(body.error || "Could not queue research");
    else toast.success(`Research request #${body.job.id} saved. Ask Codex to work the queued jobs.`);
    await load();
    setBusy(false);
  }

  if (workspaceLoading) return null;
  if (workspaceId === null)
    return (
      <main className="mx-auto max-w-4xl p-8">
        <WorkspaceRequired action="start a video" />
      </main>
    );

  const doneCount = STAGES.filter((stage) => stages[stage.key]?.done).length;
  const latestJob = jobs[0];
  const brief = current ? readBrief(current) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 animate-fade-in-up">
      <header className="space-y-2 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Current video · {activeWorkspace?.name}
        </p>
        {current ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">{current.title}</h1>
            <p className="text-sm text-muted-foreground">
              {doneCount} of {STAGES.length} steps marked done.
            </p>
          </>
        ) : (
          <h1 className="text-3xl font-bold tracking-tight">No video selected yet</h1>
        )}
      </header>

      {!current ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pick the video you are making next</CardTitle>
            <CardDescription>
              {ideas.length === 0
                ? "There are no ideas in this workspace yet."
                : "Choosing one makes it the current video; the previous one goes back to your shortlist."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ideas
              .filter((idea) => !["rejected", "produced", "published"].includes(idea.status))
              .map((idea) => (
                <div key={idea.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{idea.title}</p>
                    <p className="text-xs text-muted-foreground">{idea.status}</p>
                  </div>
                  <Button size="sm" disabled={busy} onClick={() => makeCurrent(idea)}>
                    Make this the current video
                  </Button>
                </div>
              ))}
            <Link href="/ideas" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Go to Ideas
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {STAGES.map((stage, index) => {
            const value = stages[stage.key] ?? { notes: "", done: false };
            return (
              <Card key={stage.key} className={value.done ? "border-emerald-500/30" : undefined}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <button
                      type="button"
                      title={value.done ? "Mark as not done" : "Mark as done"}
                      onClick={() => saveStages({ ...stages, [stage.key]: { ...value, done: !value.done } })}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        value.done ? "border-emerald-500 bg-emerald-500/20 text-emerald-400" : "text-muted-foreground"
                      }`}
                    >
                      {value.done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
                    </button>
                    <div className="min-w-0">
                      <CardTitle className="text-base">
                        {index + 1}. {stage.label}
                      </CardTitle>
                      <CardDescription>{stage.hint}</CardDescription>
                    </div>
                  </div>
                  {stage.key === "references" && (
                    <Link
                      href={`/references?q=${encodeURIComponent(current.title)}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Search className="mr-1 h-3.5 w-3.5" />
                      Find references
                    </Link>
                  )}
                  {stage.key === "research" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={queueResearch}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask Codex to research this"}
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    aria-label={stage.label}
                    rows={stage.rows}
                    value={value.notes}
                    placeholder={stage.hint}
                    onChange={(event) => setStages({ ...stages, [stage.key]: { ...value, notes: event.target.value } })}
                    onBlur={(event) => saveStages({ ...stages, [stage.key]: { ...value, notes: event.target.value } })}
                  />
                  {stage.key === "references" && (
                    <p className="text-xs text-muted-foreground">
                      {collections.length === 0 ? (
                        "No reference collections saved in this workspace yet."
                      ) : (
                        <>
                          {collections.length} saved collection(s) ·{" "}
                          <Link href="/library" className="text-primary hover:underline">
                            open the library
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                  {stage.key === "research" && latestJob && (
                    <p className="text-xs text-muted-foreground">
                      Latest request #{latestJob.id}: {latestJob.status} · {latestJob.evidence.length} sourced item(s).
                      {latestJob.error && <span className="text-destructive"> {latestJob.error}</span>}
                    </p>
                  )}
                  {stage.key === "research" && brief && (
                    <details className="rounded-md border p-3 text-sm">
                      <summary className="cursor-pointer font-medium">Research brief from Codex</summary>
                      <p className="mt-2">{brief.conclusion}</p>
                      {brief.claims.length > 0 && (
                        <>
                          <p className="mt-2 font-medium">Claims</p>
                          <ul className="list-disc pl-5">
                            {brief.claims.map((claim) => (
                              <li key={claim}>{claim}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {brief.counterarguments.length > 0 && (
                        <>
                          <p className="mt-2 font-medium">Counterarguments</p>
                          <ul className="list-disc pl-5">
                            {brief.counterarguments.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {brief.sources.length > 0 && (
                        <>
                          <p className="mt-2 font-medium">Sources</p>
                          <ul className="list-disc pl-5">
                            {brief.sources.map((source) => (
                              <li key={source.url}>
                                <a className="text-primary underline" href={source.url} target="_blank" rel="noreferrer">
                                  {source.title || source.url}
                                </a>{" "}
                                ({source.sourceType}): {source.claim}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => update(current.id, { status: "produced" }).then(load)}>
              Mark as produced
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => update(current.id, { status: "shortlisted" }).then(load)}>
              Put this video back on the shortlist
            </Button>
          </div>
        </>
      )}

      {!loaded && <p className="text-sm text-muted-foreground">Loading…</p>}
    </main>
  );
}
