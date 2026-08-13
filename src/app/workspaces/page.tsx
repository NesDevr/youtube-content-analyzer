"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Archive, ArchiveRestore, Check, Loader2, Pencil, Plus, Tv, X } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, type Workspace } from "@/hooks/use-workspace";

const STATUSES = ["planned", "active", "paused", "archived"] as const;
const CONTENT_FORMATS = ["long-form", "short-form", "both"] as const;

const STATUS_STYLE: Record<string, string> = {
  planned: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  active: "bg-green-500/20 text-green-400 border-green-500/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  archived: "bg-muted text-muted-foreground",
};

interface WorkspaceForm {
  name: string;
  concept: string;
  status: string;
  language: string;
  country: string;
  targetAudience: string;
  contentFormat: string;
  positioning: string;
  constraints: string;
  ownedYoutubeChannelId: string;
}

const EMPTY_FORM: WorkspaceForm = {
  name: "",
  concept: "",
  status: "planned",
  language: "en",
  country: "",
  targetAudience: "",
  contentFormat: "long-form",
  positioning: "",
  constraints: "",
  ownedYoutubeChannelId: "",
};

function toForm(workspace: Workspace): WorkspaceForm {
  return {
    name: workspace.name,
    concept: workspace.concept,
    status: workspace.status,
    language: workspace.language,
    country: workspace.country,
    targetAudience: workspace.targetAudience,
    contentFormat: workspace.contentFormat,
    positioning: workspace.positioning,
    constraints: workspace.constraints,
    ownedYoutubeChannelId: workspace.ownedYoutubeChannelId ?? "",
  };
}

function WorkspaceFields({
  form,
  setForm,
}: {
  form: WorkspaceForm;
  setForm: (form: WorkspaceForm) => void;
}) {
  const set = (key: keyof WorkspaceForm) => (value: string) =>
    setForm({ ...form, [key]: value });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label className="text-xs text-muted-foreground">Channel name</Label>
        <Input
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
          placeholder="e.g. Consumer Cybersecurity"
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs text-muted-foreground">Concept</Label>
        <Textarea
          value={form.concept}
          onChange={(e) => set("concept")(e.target.value)}
          placeholder="What this channel is about and why it should exist"
          rows={2}
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Status</Label>
        <Select value={form.status} onValueChange={(v) => set("status")(v ?? "planned")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Content format</Label>
        <Select
          value={form.contentFormat}
          onValueChange={(v) => set("contentFormat")(v ?? "long-form")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Language</Label>
        <Input
          value={form.language}
          onChange={(e) => set("language")(e.target.value)}
          placeholder="en"
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Country</Label>
        <Input
          value={form.country}
          onChange={(e) => set("country")(e.target.value)}
          placeholder="US"
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs text-muted-foreground">Target audience</Label>
        <Input
          value={form.targetAudience}
          onChange={(e) => set("targetAudience")(e.target.value)}
          placeholder="Who this is for"
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs text-muted-foreground">Positioning</Label>
        <Input
          value={form.positioning}
          onChange={(e) => set("positioning")(e.target.value)}
          placeholder="How it differs from what already exists"
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs text-muted-foreground">
          Production constraints
        </Label>
        <Input
          value={form.constraints}
          onChange={(e) => set("constraints")(e.target.value)}
          placeholder="e.g. faceless, 6 h/week, no paid stock footage"
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs text-muted-foreground">
          Owned YouTube channel ID (optional)
        </Label>
        <Input
          value={form.ownedYoutubeChannelId}
          onChange={(e) => set("ownedYoutubeChannelId")(e.target.value)}
          placeholder="UC…"
        />
      </div>
    </div>
  );
}

export default function WorkspacesPage() {
  const { workspaces, activeWorkspace, loading, error, refresh, selectWorkspace } =
    useWorkspace();
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<WorkspaceForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<WorkspaceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setFormError(null);
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setFormError(data.error || "Workspace operation failed");
          toast.error(data.error || "Workspace operation failed");
          return null;
        }
        await refresh();
        return data.workspace as Workspace;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Workspace operation failed";
        setFormError(message);
        toast.error(message);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const handleCreate = useCallback(async () => {
    const workspace = await submit({
      action: "create",
      ...createForm,
      ownedYoutubeChannelId: createForm.ownedYoutubeChannelId || null,
    });
    if (workspace) {
      toast.success(`Workspace "${workspace.name}" created`);
      selectWorkspace(workspace.id);
      setCreateForm(EMPTY_FORM);
      setCreating(false);
    }
  }, [createForm, selectWorkspace, submit]);

  const handleUpdate = useCallback(async () => {
    if (editingId === null) return;
    const workspace = await submit({
      action: "update",
      id: editingId,
      ...editForm,
      ownedYoutubeChannelId: editForm.ownedYoutubeChannelId || null,
    });
    if (workspace) {
      toast.success("Workspace updated");
      setEditingId(null);
    }
  }, [editForm, editingId, submit]);

  const setStatus = useCallback(
    async (workspace: Workspace, status: string) => {
      const updated = await submit({ action: "update", id: workspace.id, status });
      if (updated) toast.success(`"${updated.name}" is now ${status}`);
    },
    [submit]
  );

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Channel Workspaces</h1>
          <p className="text-muted-foreground mt-1">
            Each workspace is one channel you are planning or running. Folders,
            saved searches and generated ideas belong to a single workspace.
            Public YouTube data is shared across all of them.
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)} className="flex-shrink-0">
          {creating ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          {creating ? "Cancel" : "New workspace"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New channel workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <WorkspaceFields form={createForm} setForm={setCreateForm} />
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button onClick={handleCreate} disabled={saving || !createForm.name.trim()}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Create workspace
            </Button>
            <p className="text-xs text-muted-foreground">After creation, select this workspace and start its channel setup below. No AI research is run automatically.</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : workspaces.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tv className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No workspaces yet. Create one to start research.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {workspaces.map((workspace) => (
            <Card key={workspace.id} data-testid={`workspace-${workspace.id}`}>
              <CardContent className="pt-6 space-y-4">
                {editingId === workspace.id ? (
                  <>
                    <WorkspaceFields form={editForm} setForm={setEditForm} />
                    {formError && (
                      <p className="text-sm text-destructive">{formError}</p>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={handleUpdate} disabled={saving}>
                        {saving ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4 mr-1" />
                        )}
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold">{workspace.name}</h2>
                          <Badge className={STATUS_STYLE[workspace.status]}>
                            {workspace.status}
                          </Badge>
                          {activeWorkspace?.id === workspace.id && (
                            <Badge variant="outline">selected</Badge>
                          )}
                        </div>
                        {workspace.concept && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {workspace.concept}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {workspace.contentFormat} · {workspace.language}
                          {workspace.country ? ` · ${workspace.country}` : ""} ·{" "}
                          {workspace._count?.folders ?? 0} folders ·{" "}
                          {workspace._count?.panels ?? 0} saved searches ·{" "}
                          {workspace._count?.ideaGenerations ?? 0} idea runs
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {workspace.status !== "archived" &&
                          activeWorkspace?.id !== workspace.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => selectWorkspace(workspace.id)}
                            >
                              Switch to
                            </Button>
                          )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setFormError(null);
                            setEditingId(workspace.id);
                            setEditForm(toForm(workspace));
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {workspace.status === "archived" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatus(workspace, "planned")}
                            title="Restore"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatus(workspace, "archived")}
                            title="Archive"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
