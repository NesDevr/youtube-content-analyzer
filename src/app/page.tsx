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
  Microscope,
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
      bgColor: "bg-red-500/10",
    },
    {
      href: "/keywords",
      icon: Key,
      title: "Keyword Research",
      desc: "YouTube autocomplete + AI-powered keyword suggestions for niche discovery.",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      href: "/trends",
      icon: TrendingUp,
      title: "Google Trends",
      desc: "Compare keyword interest over time, find breakout terms and rising queries.",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      href: "/ai-tools",
      icon: Sparkles,
      title: "AI Tools",
      desc: "AI idea generator, video summarizer, and keyword brainstorming.",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      href: "/analyzer",
      icon: Microscope,
      title: "Video Analyzer",
      desc: "Paste YouTube URLs for deep AI analysis of scripts, hooks, and thumbnails — plus inspired content ideas.",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
    {
      href: "/channel-starter",
      icon: Compass,
      title: "Channel Starter",
      desc: "Don't have a niche yet? Discover data-backed opportunities and get a complete content plan for your new channel.",
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in-up">
      <div>
        <Badge variant="outline" className="mb-3 text-primary border-primary/30">
          YouTube Research Suite
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to{" "}
          <span className="brand-gradient-text">YT Analyzer</span>
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
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
        <div className="flex items-center gap-3 mb-4">
          <div className="h-px flex-1 bg-border" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            How to Use
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
          <Card className="relative overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="absolute left-0 inset-y-0 w-1 bg-red-500 rounded-l-xl" />
            <CardHeader className="pb-3 pl-6">
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
            <CardContent className="pl-6">
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

          <Card className="relative overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="absolute left-0 inset-y-0 w-1 bg-blue-500 rounded-l-xl" />
            <CardHeader className="pb-3 pl-6">
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
            <CardContent className="pl-6">
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-blue-500 font-medium shrink-0">1.</span>
                  <span><Link href="/channel-starter" className="text-foreground hover:underline">Channel Starter</Link> — guided wizard that discovers niches backed by real YouTube data</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-medium shrink-0">2.</span>
                  <span>Pick a niche, get a deep dive analysis, content strategy, and your first 10 video ideas</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500 font-medium shrink-0">3.</span>
                  <span>Or explore manually: <Link href="/keywords" className="text-foreground hover:underline">AI Brainstorm</Link> keywords, check <Link href="/trends" className="text-foreground hover:underline">Google Trends</Link>, validate with <Link href="/outlier-finder" className="text-foreground hover:underline">Outlier Finder</Link></span>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="absolute left-0 inset-y-0 w-1 bg-green-500 rounded-l-xl" />
            <CardHeader className="pb-3 pl-6">
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
            <CardContent className="pl-6">
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

          <Card className="relative overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="absolute left-0 inset-y-0 w-1 bg-purple-500 rounded-l-xl" />
            <CardHeader className="pb-3 pl-6">
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
            <CardContent className="pl-6">
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

          <Card className="relative overflow-hidden hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
            <div className="absolute left-0 inset-y-0 w-1 bg-orange-500 rounded-l-xl" />
            <CardHeader className="pb-3 pl-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-orange-500/10">
                  <Microscope className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <CardTitle className="text-sm">Deep-Dive Analysis</CardTitle>
                  <Badge variant="secondary" className="text-[10px] mt-1">Advanced</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pl-6">
              <ol className="text-sm text-muted-foreground space-y-2">
                <li className="flex gap-2">
                  <span className="text-orange-500 font-medium shrink-0">1.</span>
                  <span><Link href="/analyzer" className="text-foreground hover:underline">Video Analyzer</Link> — paste YouTube URLs of videos you want to study</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-500 font-medium shrink-0">2.</span>
                  <span>AI auto-fetches transcripts and analyzes hooks, script structure, and thumbnails</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-orange-500 font-medium shrink-0">3.</span>
                  <span>Get inspired video concepts with full hook scripts and structure outlines</span>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick access cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger-children">
        {features.map((f) => (
          <Link key={f.href} href={f.href}>
            <Card className="hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-pointer h-full group">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center h-10 w-10 rounded-xl ${f.bgColor} transition-transform duration-300 group-hover:scale-110`}>
                    <f.icon className={`h-5 w-5 ${f.color}`} />
                  </div>
                  <CardTitle className="text-base group-hover:text-primary transition-colors">{f.title}</CardTitle>
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
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saved Panels</h2>
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
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Folders</h2>
            <Link href="/folders">
              <Button variant="ghost" size="sm">
                Manage <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {folders.slice(0, 8).map((folder) => (
              <Link key={folder.id} href={`/folders?id=${folder.id}`}>
                <Card className="p-4 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer">
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
