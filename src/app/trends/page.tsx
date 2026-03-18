"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TrendingUp, Loader2, X, Plus, Zap, ArrowUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TrendData {
  date: string;
  [key: string]: string | number;
}

interface RelatedQuery {
  query: string;
  value: number | string;
}

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7"];

const TIME_RANGES = [
  { label: "Past 7 days", value: "now 7-d" },
  { label: "Past month", value: "today 1-m" },
  { label: "Past 3 months", value: "today 3-m" },
  { label: "Past 12 months", value: "today 12-m" },
  { label: "Past 5 years", value: "today 5-y" },
];

export default function TrendsPage() {
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [timeRange, setTimeRange] = useState("today 12-m");
  const [chartData, setChartData] = useState<TrendData[]>([]);
  const [activeKeywords, setActiveKeywords] = useState<string[]>([]);
  const [relatedQueries, setRelatedQueries] = useState<{
    rising: RelatedQuery[];
    top: RelatedQuery[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const addKeyword = () => {
    if (keywords.length < 5) setKeywords([...keywords, ""]);
  };

  const removeKeyword = (idx: number) => {
    setKeywords(keywords.filter((_, i) => i !== idx));
  };

  const updateKeyword = (idx: number, value: string) => {
    const updated = [...keywords];
    updated[idx] = value;
    setKeywords(updated);
  };

  const handleSearch = useCallback(async () => {
    const validKeywords = keywords.filter((k) => k.trim());
    if (validKeywords.length === 0) return;

    setLoading(true);
    setError("");

    try {
      // Fetch interest over time
      const trendRes = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: validKeywords,
          timeRange,
          action: "interestOverTime",
        }),
      });
      const trendData = await trendRes.json();

      if (trendData.error) {
        setError(trendData.error);
        return;
      }

      // Transform for recharts
      const transformed: TrendData[] = [];
      const series = trendData.data || [];
      if (series.length > 0 && series[0].data) {
        for (let i = 0; i < series[0].data.length; i++) {
          const point: TrendData = { date: series[0].data[i].date };
          for (const s of series) {
            point[s.keyword] = s.data[i]?.value || 0;
          }
          transformed.push(point);
        }
      }

      setChartData(transformed);
      setActiveKeywords(validKeywords);

      // Also fetch related queries for first keyword
      const relatedRes = await fetch("/api/trends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: [validKeywords[0]],
          action: "relatedQueries",
        }),
      });
      const relatedData = await relatedRes.json();
      setRelatedQueries(relatedData.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trends fetch failed");
    } finally {
      setLoading(false);
    }
  }, [keywords, timeRange]);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Google Trends</h1>
        <p className="text-muted-foreground mt-1">
          Compare keyword interest over time, discover breakout terms, and find
          rising search queries.
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            {keywords.map((kw, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx] }}
                />
                <Input
                  placeholder={`Keyword ${idx + 1}`}
                  value={kw}
                  onChange={(e) => updateKeyword(idx, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="h-10"
                />
                {keywords.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => removeKeyword(idx)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-3 items-end">
            {keywords.length < 5 && (
              <Button variant="outline" size="sm" onClick={addKeyword}>
                <Plus className="h-4 w-4 mr-1" /> Add Keyword
              </Button>
            )}
            <div className="flex-1" />
            <div>
              <Label className="text-xs text-muted-foreground">
                Time Range
              </Label>
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v ?? "today 12-m")}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSearch} disabled={loading} className="h-10">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <TrendingUp className="h-4 w-4 mr-2" />
              )}
              Compare
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Interest Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend />
                  {activeKeywords.map((kw, idx) => (
                    <Line
                      key={kw}
                      type="monotone"
                      dataKey={kw}
                      stroke={COLORS[idx]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related queries */}
      {relatedQueries && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Rising Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {relatedQueries.rising.length > 0 ? (
                <div className="space-y-2">
                  {relatedQueries.rising.slice(0, 15).map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm">{q.query}</span>
                      <Badge
                        variant={
                          String(q.value).includes("Breakout")
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {String(q.value).includes("Breakout") ? (
                          <>
                            <ArrowUp className="h-3 w-3 mr-0.5" />
                            Breakout
                          </>
                        ) : (
                          `+${q.value}%`
                        )}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No rising queries found
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                Top Queries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {relatedQueries.top.length > 0 ? (
                <div className="space-y-2">
                  {relatedQueries.top.slice(0, 15).map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm">{q.query}</span>
                      <span className="text-xs text-muted-foreground">
                        {q.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No top queries found
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
