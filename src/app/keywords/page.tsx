"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Loader2,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import Link from "next/link";

export default function KeywordsPage() {
  const [query, setQuery] = useState("");
  const [autocompleteResults, setAutocompleteResults] = useState<string[]>([]);
  const [loading, setLoading] = useState({
    autocomplete: false,
  });
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [errors, setErrors] = useState<{
    autocomplete: string;
  }>({ autocomplete: "" });

  const handleAutocomplete = useCallback(async () => {
    if (!query.trim()) return;
    setLoading((l) => ({ ...l, autocomplete: true }));
    setErrors((e) => ({ ...e, autocomplete: "" }));
    try {
      const res = await fetch(
        `/api/keywords/autocomplete?q=${encodeURIComponent(query.trim())}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Autocomplete failed");
      setAutocompleteResults(data.suggestions || []);
    } catch (err) {
      setAutocompleteResults([]);
      setErrors((e) => ({
        ...e,
        autocomplete:
          err instanceof Error ? err.message : "Autocomplete failed",
      }));
    } finally {
      setLoading((l) => ({ ...l, autocomplete: false }));
    }
  }, [query]);

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
    <div className="p-8 max-w-6xl mx-auto space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Keyword Research</h1>
        <p className="text-muted-foreground mt-1">
          YouTube&apos;s own autocomplete suggestions for a topic. These are
          starting points for a search, not search-volume data or evidence of demand.
        </p>
      </div>

      <div className="space-y-6">
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
                  }}
                  disabled={loading.autocomplete}
                  className="h-11 px-6"
                >
                  {loading.autocomplete ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Research
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="max-w-2xl">
            {/* Autocomplete Results */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-blue-500/50" />
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
                ) : errors.autocomplete ? (
                  <p className="text-sm text-destructive py-8 text-center">
                    {errors.autocomplete}
                  </p>
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

          </div>
      </div>
    </div>
  );
}
