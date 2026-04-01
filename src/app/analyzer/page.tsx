"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Microscope,
  Loader2,
  Sparkles,
  Target,
  Layout,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Eye,
  Lightbulb,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { extractVideoIds } from "@/lib/transcript";

interface VideoInfo {
  id: string;
  title: string;
  channelName: string;
  views: number;
  thumbnailUrl: string;
  hasTranscript: boolean;
}

interface Analysis {
  videoTitle: string;
  hookAnalysis: string;
  scriptStructure: string;
  contentPatterns: string;
  thumbnailAnalysis: string;
  whyItWorks: string;
  replicableTakeaways: string[];
}

interface Inspiration {
  title: string;
  hookScript: string;
  structureOutline: string;
  thumbnailConcept: string;
  whyItShouldWork: string;
  inspiredBy: string;
}

type LoadingStep =
  | "idle"
  | "metadata"
  | "transcripts"
  | "analyzing"
  | "inspiring"
  | "done";

const STEP_LABELS: Record<LoadingStep, string> = {
  idle: "",
  metadata: "Fetching video metadata...",
  transcripts: "Fetching transcripts...",
  analyzing: "Analyzing videos with AI...",
  inspiring: "Generating inspired ideas...",
  done: "",
};

export default function AnalyzerPage() {
  const [urls, setUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>("idle");

  // Results
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [inspirations, setInspirations] = useState<Inspiration[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // UI state
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const detectedIds = useMemo(() => extractVideoIds(urls), [urls]);
  const hasResults = analyses.length > 0 || inspirations.length > 0;

  const toggleCard = (id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (detectedIds.length === 0) return;
    setLoading(true);
    setLoadingStep("metadata");
    setVideos([]);
    setAnalyses([]);
    setInspirations([]);
    setErrors([]);
    setOpenCards(new Set());

    try {
      // Simulate step progression (the API does it all at once,
      // but we show steps for UX)
      const stepTimer = setInterval(() => {
        setLoadingStep((prev) => {
          if (prev === "metadata") return "transcripts";
          if (prev === "transcripts") return "analyzing";
          if (prev === "analyzing") return "inspiring";
          return prev;
        });
      }, 3000);

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      clearInterval(stepTimer);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await res.json();
      setVideos(data.videos || []);
      setAnalyses(data.analyses || []);
      setInspirations(data.inspirations || []);
      setErrors(data.errors || []);
      setLoadingStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
      setLoadingStep("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUrls("");
    setVideos([]);
    setAnalyses([]);
    setInspirations([]);
    setErrors([]);
    setLoadingStep("idle");
    setOpenCards(new Set());
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Video Analyzer</h1>
        <p className="text-muted-foreground mt-1">
          Paste YouTube URLs to deep-analyze what makes videos work and get
          inspired content ideas.
        </p>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Microscope className="h-4 w-4 text-orange-500" />
            Analyze Videos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Paste YouTube video URLs (one per line, comma-separated, or
            space-separated). Supports youtube.com, youtu.be, and bare video
            IDs. Max 10 videos.
          </p>

          <Textarea
            placeholder={`https://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/abc123def45\n...`}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={5}
            disabled={loading}
          />

          <div className="flex items-center gap-3">
            <Button
              onClick={handleAnalyze}
              disabled={loading || detectedIds.length === 0}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Microscope className="h-4 w-4 mr-2" />
              )}
              Analyze
            </Button>

            {hasResults && (
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                New Analysis
              </Button>
            )}

            {detectedIds.length > 0 && (
              <Badge variant="secondary">
                {detectedIds.length} video{detectedIds.length !== 1 ? "s" : ""}{" "}
                detected
              </Badge>
            )}

            {detectedIds.length > 10 && (
              <Badge variant="destructive">Max 10 — only first 10 will be analyzed</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading indicator */}
      {loading && (
        <Card className="border-orange-500/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              <div className="text-center">
                <p className="font-medium">{STEP_LABELS[loadingStep]}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This may take a minute for multiple videos
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                {(
                  ["metadata", "transcripts", "analyzing", "inspiring"] as const
                ).map((step) => {
                  const steps = ["metadata", "transcripts", "analyzing", "inspiring"] as const;
                  const currentIdx = steps.indexOf(loadingStep as typeof steps[number]);
                  const stepIdx = steps.indexOf(step);
                  return (
                    <div
                      key={step}
                      className={`h-2 w-14 rounded-full transition-all duration-500 ${
                        step === loadingStep
                          ? "bg-primary shadow-sm shadow-primary/30"
                          : stepIdx < currentIdx
                            ? "bg-primary/40"
                            : "bg-muted"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-yellow-500/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="space-y-1">
                {errors.map((err, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {err}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video strip */}
      {videos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {videos.map((v) => (
            <div
              key={v.id}
              className="flex-shrink-0 w-56 rounded-lg border border-border bg-card overflow-hidden"
            >
              <img
                src={v.thumbnailUrl}
                alt={v.title}
                className="w-full h-32 object-cover"
              />
              <div className="p-3 space-y-1">
                <p className="text-xs font-medium line-clamp-2">{v.title}</p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {v.views.toLocaleString()} views
                  </p>
                  {v.hasTranscript ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] gap-1 text-green-500"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Transcript
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-[10px] gap-1 text-yellow-500"
                    >
                      <AlertCircle className="h-3 w-3" />
                      No transcript
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Per-video analyses */}
      {analyses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Video Analyses</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (openCards.size === analyses.length) {
                  setOpenCards(new Set());
                } else {
                  setOpenCards(
                    new Set(analyses.map((a) => a.videoTitle))
                  );
                }
              }}
            >
              {openCards.size === analyses.length
                ? "Collapse All"
                : "Expand All"}
            </Button>
          </div>

          {analyses.map((analysis) => {
            const isOpen = openCards.has(analysis.videoTitle);
            return (
              <Card key={analysis.videoTitle}>
                <button
                  className="w-full text-left"
                  onClick={() => toggleCard(analysis.videoTitle)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 text-orange-500" />
                        <CardTitle className="text-sm">
                          {analysis.videoTitle}
                        </CardTitle>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CardHeader>
                </button>

                {isOpen && (
                  <CardContent className="space-y-5 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium">
                            Hook Analysis
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {analysis.hookAnalysis}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Layout className="h-4 w-4 text-blue-500" />
                          <span className="text-sm font-medium">
                            Script Structure
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {analysis.scriptStructure}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-green-500" />
                          <span className="text-sm font-medium">
                            Content Patterns
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {analysis.contentPatterns}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <ImageIcon className="h-4 w-4 text-purple-500" />
                          <span className="text-sm font-medium">
                            Thumbnail Analysis
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {analysis.thumbnailAnalysis}
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">
                          Why It Works
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {analysis.whyItWorks}
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">
                          Replicable Takeaways
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {analysis.replicableTakeaways.map((t, i) => (
                          <li
                            key={i}
                            className="text-sm text-muted-foreground flex gap-2"
                          >
                            <span className="text-green-500 shrink-0">
                              {i + 1}.
                            </span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Inspired Ideas */}
      {inspirations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Inspired Video Ideas
          </h2>

          {inspirations.map((idea, i) => (
            <Card key={i} className="border-yellow-500/10">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                      Idea {i + 1}
                    </Badge>
                    <CardTitle className="text-base">{idea.title}</CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">
                          Hook Script
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() =>
                          copyToClipboard(idea.hookScript, `hook-${i}`)
                        }
                      >
                        {copiedId === `hook-${i}` ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-sm italic whitespace-pre-wrap">
                      {idea.hookScript}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Layout className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">
                        Structure Outline
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {idea.structureOutline}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ImageIcon className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">
                        Thumbnail Concept
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {idea.thumbnailConcept}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium">
                        Why It Should Work
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {idea.whyItShouldWork}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Lightbulb className="h-3 w-3" />
                  <span>Inspired by: {idea.inspiredBy}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
