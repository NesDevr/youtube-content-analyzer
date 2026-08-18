"use client";

/** Everything already kept in this workspace: reference sets, verified outliers, saved videos and written observations. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkspaceRequired } from "@/components/workspace-required";
import { useWorkspace } from "@/hooks/use-workspace";
import { number, shortDate } from "@/components/evidence-panels";

interface ReferenceItem {
  id: number;
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  views: number | null;
  publishedAt: string;
  use: string;
  sourceQuery: string;
  language: string;
  region: string;
}

interface Collection {
  id: number;
  name: string;
  question: string;
  createdAt: string;
  items: ReferenceItem[];
}

interface Outlier {
  id: number;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  views: number | null;
  ratio: number | null;
  status: string;
  metric: string;
  sampleSize: number;
  collectedAt: string;
}

interface Folder {
  id: number;
  name: string;
  videos: Array<{ id: string; title: string; channelName: string; thumbnailUrl: string; views: number }>;
}

interface Observation {
  id: number;
  entityType: string;
  entityId: string;
  topic: string;
  viewerPromise: string;
  titleThumbnail: string;
  notes: string;
  updatedAt: string;
}

function watchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export default function LibraryPage() {
  const { workspaceId, activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [outliers, setOutliers] = useState<Outlier[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);

  const load = useCallback(async () => {
    if (workspaceId === null) return;
    try {
      const [referenceRes, libraryRes] = await Promise.all([
        fetch(`/api/references?workspaceId=${workspaceId}`),
        fetch(`/api/library?workspaceId=${workspaceId}`),
      ]);
      if (!referenceRes.ok || !libraryRes.ok) throw new Error("Could not load the library");
      setCollections((await referenceRes.json()).collections);
      const library = await libraryRes.json();
      setOutliers(library.outliers);
      setFolders(library.folders);
      setObservations(library.observations);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load the library");
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  if (workspaceLoading) return null;
  if (workspaceId === null)
    return (
      <main className="mx-auto max-w-4xl p-8">
        <WorkspaceRequired action="open a library" />
      </main>
    );

  const savedVideos = folders.flatMap((folder) => folder.videos.map((video) => ({ ...video, folder: folder.name })));

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-8 animate-fade-in-up">
      <header className="space-y-2 border-b pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Library · {activeWorkspace?.name}</p>
        <h1 className="text-3xl font-bold tracking-tight">What you have kept</h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Reference collections</h2>
        {collections.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
              <Link href="/references" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Find references
              </Link>
            </CardContent>
          </Card>
        ) : (
          collections.map((collection) => (
            <Card key={collection.id}>
              <CardHeader>
                <CardTitle className="text-base">{collection.name}</CardTitle>
                <CardDescription>
                  {collection.question || "No research question recorded."} · {collection.items.length} reference(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {collection.items.map((item) => (
                    <div key={item.id} className="space-y-2 rounded-lg border p-2">
                      <a href={watchUrl(item.videoId)} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.thumbnailUrl} alt={item.title} className="aspect-video w-full rounded object-cover" />
                      </a>
                      <Badge variant="outline" className="text-[10px]">
                        {item.use}
                      </Badge>
                      <p className="line-clamp-2 text-xs font-medium" title={item.title}>
                        {item.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.channelName} · {number(item.views)} views · {shortDate(item.publishedAt)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.sourceQuery ? `Found by “${item.sourceQuery}”` : "Saved directly"}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Verified outliers</h2>
        {outliers.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-muted-foreground">
              No video has been analyzed in this workspace yet. Paste a YouTube link in Find references to verify one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {outliers.map((outlier) => (
              <div key={outlier.id} className="flex gap-3 rounded-lg border p-3">
                {outlier.thumbnailUrl && (
                  <a href={watchUrl(outlier.videoId)} target="_blank" rel="noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={outlier.thumbnailUrl} alt={outlier.title} className="w-32 rounded object-cover" />
                  </a>
                )}
                <div className="min-w-0 space-y-1">
                  <p className="line-clamp-2 text-sm font-medium">{outlier.title || outlier.videoId}</p>
                  <p className="text-xs text-muted-foreground">
                    {outlier.channelName} · {number(outlier.views)} views
                  </p>
                  <p className="text-xs">
                    {outlier.ratio === null ? (
                      <span className="text-amber-400">No ratio — {outlier.status || "insufficient data"}</span>
                    ) : (
                      <>
                        <b>{outlier.ratio}×</b> the median of {outlier.sampleSize} comparable upload(s)
                      </>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {outlier.metric} · measured {shortDate(outlier.collectedAt)}
                  </p>
                  <a
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    href={watchUrl(outlier.videoId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open on YouTube <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {savedVideos.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Saved videos</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {savedVideos.map((video) => (
              <div key={`${video.folder}-${video.id}`} className="space-y-2 rounded-lg border p-2">
                <a href={watchUrl(video.id)} target="_blank" rel="noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={video.thumbnailUrl} alt={video.title} className="aspect-video w-full rounded object-cover" />
                </a>
                <p className="line-clamp-2 text-xs font-medium">{video.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {video.channelName} · {number(video.views)} views · in {video.folder}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {observations.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Your observations</h2>
          {observations.map((observation) => (
            <div key={observation.id} className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {observation.entityType} {observation.entityId} · {shortDate(observation.updatedAt)}
              </p>
              {observation.topic && <p>{observation.topic}</p>}
              {observation.viewerPromise && <p className="text-muted-foreground">Promise: {observation.viewerPromise}</p>}
              {observation.titleThumbnail && <p className="text-muted-foreground">Packaging: {observation.titleThumbnail}</p>}
              {observation.notes && <p className="text-muted-foreground">{observation.notes}</p>}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
