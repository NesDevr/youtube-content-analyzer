"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Search,
  Key,
  TrendingUp,
  FolderOpen,
  Sparkles,
  ArrowRight,
  Target,
  Lightbulb,
  Compass,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useFolders } from "@/hooks/use-folders";
import { usePanels } from "@/hooks/use-panels";

export default function Dashboard() {
  const { folders, error: folderError } = useFolders();
  const { panels, error: panelError } = usePanels();
  const loadError = folderError || panelError;

  const features = [
    {
      href: "/outlier-finder",
      icon: Search,
      title: "Outlier Finder",
      desc: "Find viral videos from small channels. The core algorithm that surfaces hidden gems.",
      color: "text-red-500",
    },
    {
      href: "/keywords",
      icon: Key,
      title: "Keyword Research",
      desc: "YouTube autocomplete + AI-powered keyword suggestions for niche discovery.",
      color: "text-blue-500",
    },
    {
      href: "/trends",
      icon: TrendingUp,
      title: "Google Trends",
      desc: "Compare keyword interest over time, find breakout terms and rising queries.",
      color: "text-green-500",
    },
    {
      href: "/ai-tools",
      icon: Sparkles,
      title: "AI Tools",
      desc: "AI idea generator, video summarizer, and keyword brainstorming.",
      color: "text-purple-500",
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Your YouTube research command center. Find niches, discover outliers,
          and generate content ideas.
        </p>
      </div>

      {loadError && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
          {loadError}
        </div>
      )}

      {/* Workflows */}
      <div>
        <h2 className="text-lg font-semibold mb-4">How to Use</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-red-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-red-500/10">
                  <Target className="h-4 w-4 text-red-500" />
                </div>
                <div>
                  <CardTitle className="text-sm">Niche Research to Video Ideas</CardTitle>
                  <Badge variant="secondary" className="text-[10px] mt-1">Full pipeline</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-red-500 font-medium shrink-0">1.</span>
                  <span><Link href="/keywords" className="text-foreground hover:underline">Keyword Research</Link> — find what viewers are actually searching for in your niche</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-500 font-medium shrink-0">2.</span>
                  <span><Link href="/outlier-finder" className="text-foreground hover:underline">Outlier Finder</Link> — search those keywords to find viral videos from small channels</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-500 font-medium shrink-0">3.</span>
                  <span><Link href="/folders" className="text-foreground hover:underline">Folders</Link> — save the best outliers into a folder</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-red-500 font-medium shrink-0">4.</span>
                  <span><Link href="/ai-tools" className="text-foreground hover:underline">AI Ideas</Link> — select that folder and generate video ideas based on what went viral</span>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-blue-500/10">
                  <Compass className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <CardTitle className="text-sm">Discover a New Niche</CardTitle>
                  <Badge variant="secondary" className="text-[10px] mt-1">Exploration</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-blue-500 font-medium shrink-0">1.</span>
                  <span><Link href="/keywords" className="text-foreground hover:underline">AI Brainstorm</Link> — describe a broad topic and let AI generate keyword ideas</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-medium shrink-0">2.</span>
                  <span><Link href="/trends" className="text-foreground hover:underline">Google Trends</Link> — compare those keywords to see which ones are growing</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-medium shrink-0">3.</span>
                  <span><Link href="/outlier-finder" className="text-foreground hover:underline">Outlier Finder</Link> — search the trending keywords to validate demand with real videos</span>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className="border-green-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-green-500/10">
                  <Lightbulb className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <CardTitle className="text-sm">Quick Video Idea</CardTitle>
                  <Badge variant="secondary" className="text-[10px] mt-1">Fast</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-green-500 font-medium shrink-0">1.</span>
                  <span><Link href="/outlier-finder" className="text-foreground hover:underline">Outlier Finder</Link> — search a keyword you already have in mind</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500 font-medium shrink-0">2.</span>
                  <span>Use &quot;Find Similar&quot; on any video to discover related outliers</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-green-500 font-medium shrink-0">3.</span>
                  <span>Open a video on YouTube, copy its transcript, and use the <Link href="/ai-tools" className="text-foreground hover:underline">Summarizer</Link> to study it</span>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className="border-purple-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-purple-500/10">
                  <Zap className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <CardTitle className="text-sm">Spy on What&apos;s Working Now</CardTitle>
                  <Badge variant="secondary" className="text-[10px] mt-1">Competitive</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-purple-500 font-medium shrink-0">1.</span>
                  <span><Link href="/outlier-finder" className="text-foreground hover:underline">Outlier Finder</Link> — search your niche, filter by &quot;Last 7 days&quot; to see what&apos;s popping right now</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-500 font-medium shrink-0">2.</span>
                  <span>Sort by &quot;Views/Hour&quot; to find videos gaining momentum fast</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-purple-500 font-medium shrink-0">3.</span>
                  <span>Save the top performers and use <Link href="/ai-tools" className="text-foreground hover:underline">AI Ideas</Link> to create your own spin</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick access cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((f) => (
          <Link key={f.href} href={f.href}>
            <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <f.icon className={`h-5 w-5 ${f.color}`} />
                  <CardTitle className="text-base">{f.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{f.desc}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent Panels */}
      {panels.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Saved Panels</h2>
            <Link href="/outlier-finder">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {panels.slice(0, 6).map((panel) => (
              <Card key={panel.id} className="p-4">
                <p className="font-medium text-sm">{panel.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Keyword: {panel.keyword}
                </p>
                {panel.lastRefreshed && (
                  <p className="text-xs text-muted-foreground">
                    Last checked:{" "}
                    {new Date(panel.lastRefreshed).toLocaleDateString()}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Folders */}
      {folders.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Your Folders</h2>
            <Link href="/folders">
              <Button variant="ghost" size="sm">
                Manage <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {folders.slice(0, 8).map((folder) => (
              <Link key={folder.id} href={`/folders?id=${folder.id}`}>
                <Card className="p-4 hover:border-primary/30 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{folder.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {folder._count.videos} videos
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
