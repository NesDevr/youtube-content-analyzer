"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  Loader2,
  Sparkles,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";

export default function KeywordsPage() {
  const [query, setQuery] = useState("");
  const [autocompleteResults, setAutocompleteResults] = useState<string[]>([]);
  const [aiKeywords, setAiKeywords] = useState<string[]>([]);
  const [brainstormResults, setBrainstormResults] = useState<{
    keywords: string[];
    reasoning: string;
  } | null>(null);
  const [nicheInput, setNicheInput] = useState("");
  const [loading, setLoading] = useState({
    autocomplete: false,
    ai: false,
    brainstorm: false,
  });
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleAutocomplete = useCallback(async () => {
    if (!query.trim()) return;
    setLoading((l) => ({ ...l, autocomplete: true }));
    try {
      const res = await fetch(
        `/api/keywords/autocomplete?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      setAutocompleteResults(data.suggestions || []);
    } catch {
      setAutocompleteResults([]);
    } finally {
      setLoading((l) => ({ ...l, autocomplete: false }));
    }
  }, [query]);

  const handleAIKeywords = useCallback(async () => {
    if (!query.trim()) return;
    setLoading((l) => ({ ...l, ai: true }));
    try {
      const res = await fetch("/api/keywords/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: query.trim() }),
      });
      const data = await res.json();
      setAiKeywords(data.keywords || []);
    } catch {
      setAiKeywords([]);
    } finally {
      setLoading((l) => ({ ...l, ai: false }));
    }
  }, [query]);

  const handleBrainstorm = useCallback(async () => {
    if (!nicheInput.trim()) return;
    setLoading((l) => ({ ...l, brainstorm: true }));
    try {
      const res = await fetch("/api/keywords/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: nicheInput.trim(), mode: "brainstorm" }),
      });
      const data = await res.json();
      setBrainstormResults(data);
    } catch {
      setBrainstormResults(null);
    } finally {
      setLoading((l) => ({ ...l, brainstorm: false }));
    }
  }, [nicheInput]);

  const copyKeyword = (kw: string, idx: number) => {
    navigator.clipboard.writeText(kw);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  const KeywordList = ({
    keywords,
    prefix,
  }: {
    keywords: string[];
    prefix: string;
  }) => (
    <div className="space-y-2">
      {keywords.map((kw, i) => (
        <div
          key={`${prefix}-${i}`}
          className="flex items-center justify-between group px-3 py-2 rounded-lg hover:bg-accent transition-colors"
        >
          <span className="text-sm">{kw}</span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => copyKeyword(kw, i)}
              aria-label={copiedIdx === i ? "Copied" : "Copy keyword to clipboard"}
            >
              {copiedIdx === i ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            <Link href={`/outlier-finder?q=${encodeURIComponent(kw)}`}>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Keyword Research</h1>
        <p className="text-muted-foreground mt-1">
          Discover what people search for on YouTube. Use autocomplete data and
          AI suggestions to find profitable niches.
        </p>
      </div>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList>
          <TabsTrigger value="search">Search Keywords</TabsTrigger>
          <TabsTrigger value="brainstorm">AI Brainstorm</TabsTrigger>
        </TabsList>

        {/* Search Keywords Tab */}
        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-3">
                <Input
                  placeholder="Enter a topic (e.g., stoicism, passive income)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAutocomplete()}
                  className="h-11"
                />
                <Button
                  onClick={() => {
                    handleAutocomplete();
                    handleAIKeywords();
                  }}
                  disabled={loading.autocomplete || loading.ai}
                  className="h-11 px-6"
                >
                  {loading.autocomplete || loading.ai ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Research
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Autocomplete Results */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  YouTube Autocomplete
                  {autocompleteResults.length > 0 && (
                    <Badge variant="secondary">
                      {autocompleteResults.length}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading.autocomplete ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : autocompleteResults.length > 0 ? (
                  <KeywordList
                    keywords={autocompleteResults}
                    prefix="auto"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Enter a topic and click Research to see what people search
                    for on YouTube.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* AI Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  AI Keyword Suggestions
                  {aiKeywords.length > 0 && (
                    <Badge variant="secondary">{aiKeywords.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading.ai ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : aiKeywords.length > 0 ? (
                  <KeywordList keywords={aiKeywords} prefix="ai" />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    AI will suggest keywords optimized for finding viral content
                    in your niche.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* AI Brainstorm Tab */}
        <TabsContent value="brainstorm" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                AI Keyword Brainstorm
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Describe a broad niche you want to explore. E.g., 'stoicism and self-improvement for men aged 20-35' or 'horror stories narration for faceless channels'"
                value={nicheInput}
                onChange={(e) => setNicheInput(e.target.value)}
                rows={3}
              />
              <Button
                onClick={handleBrainstorm}
                disabled={loading.brainstorm}
              >
                {loading.brainstorm ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Generate Keywords
              </Button>
            </CardContent>
          </Card>

          {brainstormResults && (
            <>
              {brainstormResults.reasoning && (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      {brainstormResults.reasoning}
                    </p>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Generated Keywords
                    <Badge variant="secondary">
                      {brainstormResults.keywords.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <KeywordList
                    keywords={brainstormResults.keywords}
                    prefix="brain"
                  />
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
