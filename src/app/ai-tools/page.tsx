"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Loader2,
  Lightbulb,
  FileText,
  Target,
  Layout,
  Image as ImageIcon,
  TrendingUp,
} from "lucide-react";
import { useFolders } from "@/hooks/use-folders";

interface FolderVideo {
  videoId: string;
  video: {
    id: string;
    title: string;
    channelName: string;
    views: number;
    likes: number;
    description: string;
    outlierScore: number | null;
  };
}

interface VideoIdea {
  topic: string;
  hook: string;
  structure: string;
  thumbnailConcept: string;
  estimatedPotential: string;
}

export default function AIToolsPage() {
  const { folders, error: folderError } = useFolders();
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [folderVideos, setFolderVideos] = useState<FolderVideo[]>([]);

  // Idea Generator state
  const [analysis, setAnalysis] = useState<string>("");
  const [ideas, setIdeas] = useState<VideoIdea[]>([]);
  const [ideaLoading, setIdeaLoading] = useState(false);

  // Summarizer state
  const [videoUrl, setVideoUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadFolderVideos = async (folderId: string) => {
    setSelectedFolderId(folderId);
    if (!folderId) return;
    try {
      const res = await fetch(`/api/folders/${folderId}`);
      const data = await res.json();
      setFolderVideos(data.folder?.videos || []);
    } catch {
      setFolderVideos([]);
    }
  };

  const generateIdeas = async () => {
    if (folderVideos.length === 0) return;
    setIdeaLoading(true);
    setAnalysis("");
    setIdeas([]);

    try {
      const videos = folderVideos.slice(0, 5).map((fv) => ({
        title: fv.video.title,
        views: fv.video.views,
        likes: fv.video.likes,
        channelName: fv.video.channelName,
        channelSubscribers: 0,
        outlierScore: fv.video.outlierScore || 1,
        description: fv.video.description,
      }));

      const res = await fetch("/api/ai/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos, folderId: selectedFolderId ? parseInt(selectedFolderId) || null : null }),
      });
      const data = await res.json();
      setAnalysis(data.analysis || "");
      setIdeas(data.ideas || []);
    } catch (err) {
      setAnalysis(
        "Error: " + (err instanceof Error ? err.message : "Failed to generate")
      );
    } finally {
      setIdeaLoading(false);
    }
  };

  const handleSummarize = async () => {
    if (!transcript.trim()) return;
    setSummaryLoading(true);
    setSummary("");

    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl,
          title: "Video",
          views: 0,
          likes: 0,
          transcript: transcript.trim(),
        }),
      });
      const data = await res.json();
      setSummary(data.summary || data.error || "No summary generated");
    } catch (err) {
      setSummary(
        "Error: " + (err instanceof Error ? err.message : "Failed to summarize")
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Tools</h1>
        <p className="text-muted-foreground mt-1">
          AI-powered content analysis, idea generation, and video summarization.
        </p>
      </div>

      <Tabs defaultValue="ideas" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ideas">Idea Generator</TabsTrigger>
          <TabsTrigger value="summarizer">Video Summarizer</TabsTrigger>
        </TabsList>

        {/* Idea Generator Tab */}
        <TabsContent value="ideas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                AI Idea Generator
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a folder with 3-5 viral videos. The AI will analyze why
                they went viral and generate new content ideas.
              </p>

              {folderError && (
                <p className="text-sm text-destructive">{folderError}</p>
              )}

              <div className="flex gap-3">
                <Select
                  value={selectedFolderId}
                  onValueChange={(v) => loadFolderVideos(v ?? "")}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select a folder" />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name} ({f._count.videos} videos)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={generateIdeas}
                  disabled={ideaLoading || folderVideos.length === 0}
                >
                  {ideaLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Generate Ideas
                </Button>
              </div>

              {folderVideos.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Videos to analyze:{" "}
                  {folderVideos
                    .slice(0, 5)
                    .map((fv) => `"${fv.video.title}"`)
                    .join(", ")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis results */}
          {analysis && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pattern Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{analysis}</p>
              </CardContent>
            </Card>
          )}

          {ideas.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Generated Video Ideas</h2>
              {ideas.map((idea, i) => (
                <Card key={i} className="relative overflow-hidden">
                  <div className="absolute left-0 inset-y-0 w-1 bg-gradient-to-b from-yellow-500 to-orange-500 rounded-l-xl" />
                  <CardHeader className="pb-3 pl-6">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Idea {i + 1}</Badge>
                      <CardTitle className="text-base">{idea.topic}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Target className="h-4 w-4 text-red-500" />
                          <span className="text-sm font-medium">Hook</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {idea.hook}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Layout className="h-4 w-4 text-blue-500" />
                          <span className="text-sm font-medium">Structure</span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {idea.structure}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <ImageIcon className="h-4 w-4 text-green-500" />
                          <span className="text-sm font-medium">
                            Thumbnail Concept
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {idea.thumbnailConcept}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="h-4 w-4 text-purple-500" />
                          <span className="text-sm font-medium">
                            Estimated Potential
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {idea.estimatedPotential}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Video Summarizer Tab */}
        <TabsContent value="summarizer" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                Video Summarizer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste a video transcript to get an AI-powered summary with key
                takeaways. Copy transcripts from YouTube&apos;s transcript
                feature.
              </p>

              <Input
                placeholder="YouTube video URL (optional, for reference)"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
              />

              <Textarea
                placeholder="Paste the video transcript here..."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={8}
              />

              <Button
                onClick={handleSummarize}
                disabled={summaryLoading || !transcript.trim()}
              >
                {summaryLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Summarize
              </Button>
            </CardContent>
          </Card>

          {summary && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap">{summary}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
