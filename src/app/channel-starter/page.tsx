"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Compass,
  Loader2,
  SkipForward,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Layout,
  Lightbulb,
  Copy,
  Check,
  Users,
  BarChart3,
  Search,
  Sparkles,
  Calendar,
  Trophy,
  Rocket,
  FileText,
  Image as ImageIcon,
  Zap,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import type {
  WizardStep,
  UserProfile,
  NicheSuggestion,
  NicheDeepDive,
  ContentStrategy,
  StarterContentPlan,
} from "@/types/channel-starter";

type LoadingPhase =
  | "idle"
  | "generating"
  | "validating"
  | "trends"
  | "analyzing"
  | "done";

const LOADING_LABELS: Record<LoadingPhase, string> = {
  idle: "",
  generating: "Generating niche ideas with AI...",
  validating: "Validating with real YouTube data...",
  trends: "Checking Google Trends...",
  analyzing: "Analyzing data...",
  done: "",
};

const STEP_NAMES = [
  "About You",
  "Discover",
  "Deep Dive",
  "Strategy",
  "Content Plan",
] as const;

const GOAL_OPTIONS = [
  "Monetization",
  "Growth",
  "Community",
  "Creative Expression",
  "Education",
];

export default function ChannelStarterPage() {
  // Wizard state
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [niches, setNiches] = useState<NicheSuggestion[]>([]);
  const [selectedNiche, setSelectedNiche] = useState<NicheSuggestion | null>(
    null
  );
  const [deepDive, setDeepDive] = useState<NicheDeepDive | null>(null);
  const [strategy, setStrategy] = useState<ContentStrategy | null>(null);
  const [contentPlan, setContentPlan] = useState<StarterContentPlan | null>(
    null
  );
  const [discoveryId, setDiscoveryId] = useState<number | null>(null);

  // Form state (step 1)
  const [interests, setInterests] = useState("");
  const [skills, setSkills] = useState("");
  const [faceless, setFaceless] = useState(false);
  const [budget, setBudget] = useState<"low" | "medium" | "high">("low");
  const [hoursPerWeek, setHoursPerWeek] = useState(10);
  const [goals, setGoals] = useState<string[]>([]);
  const [contentType, setContentType] = useState<
    "long-form" | "short-form" | "both" | "shorts"
  >("both");

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>("idle");
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const completedSteps = new Set<WizardStep>();
  if (niches.length > 0) completedSteps.add(1).add(2);
  if (deepDive) completedSteps.add(3);
  if (strategy) completedSteps.add(4);
  if (contentPlan) completedSteps.add(5);

  const toggleCard = (id: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Step Handlers ─────────────────────────────────────

  const buildProfile = (): UserProfile | null => {
    const parsedInterests = interests
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedSkills = skills
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (
      parsedInterests.length === 0 &&
      parsedSkills.length === 0 &&
      goals.length === 0
    ) {
      return null;
    }

    return {
      interests: parsedInterests,
      skills: parsedSkills,
      constraints: { faceless, budget, hoursPerWeek },
      goals,
      contentType,
    };
  };

  const handleSkipProfile = () => {
    setProfile(null);
    handleDiscover(null);
  };

  const handleContinueProfile = () => {
    const p = buildProfile();
    setProfile(p);
    handleDiscover(p);
  };

  const handleDiscover = async (profileData: UserProfile | null) => {
    setLoading(true);
    setLoadingPhase("generating");
    setCurrentStep(2);

    const stepTimer = setInterval(() => {
      setLoadingPhase((prev) => {
        if (prev === "generating") return "validating";
        if (prev === "validating") return "trends";
        if (prev === "trends") return "analyzing";
        return prev;
      });
    }, 8000);

    try {
      const res = await fetch("/api/channel-starter/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileData }),
      });

      clearInterval(stepTimer);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Discovery failed");
      }

      const data = await res.json();
      setNiches(data.niches);
      setDiscoveryId(data.discoveryId);
      setLoadingPhase("done");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to discover niches"
      );
      setLoadingPhase("idle");
      setCurrentStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDive = async () => {
    if (!selectedNiche || !discoveryId) return;
    setLoading(true);
    setLoadingPhase("analyzing");
    setCurrentStep(3);

    try {
      const res = await fetch("/api/channel-starter/deep-dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveryId,
          nicheName: selectedNiche.name,
          searchKeywords: selectedNiche.searchKeywords,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Deep dive failed");
      }

      const data = await res.json();
      setDeepDive(data.deepDive);
      setLoadingPhase("done");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to analyze niche"
      );
      setLoadingPhase("idle");
      setCurrentStep(2);
    } finally {
      setLoading(false);
    }
  };

  const handleStrategy = async () => {
    if (!deepDive || !discoveryId || !selectedNiche) return;
    setLoading(true);
    setLoadingPhase("generating");
    setCurrentStep(4);

    try {
      const res = await fetch("/api/channel-starter/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveryId,
          nicheName: selectedNiche.name,
          profile,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Strategy generation failed");
      }

      const data = await res.json();
      setStrategy(data.strategy);
      setLoadingPhase("done");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate strategy"
      );
      setLoadingPhase("idle");
      setCurrentStep(3);
    } finally {
      setLoading(false);
    }
  };

  const handleContentPlan = async () => {
    if (!strategy || !discoveryId || !selectedNiche) return;
    setLoading(true);
    setLoadingPhase("generating");
    setCurrentStep(5);

    try {
      const res = await fetch("/api/channel-starter/content-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveryId,
          nicheName: selectedNiche.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Content plan generation failed");
      }

      const data = await res.json();
      setContentPlan(data.contentPlan);
      setLoadingPhase("done");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate content plan"
      );
      setLoadingPhase("idle");
      setCurrentStep(4);
    } finally {
      setLoading(false);
    }
  };

  // ── Rendering ─────────────────────────────────────────

  const TrendIcon = ({ direction }: { direction: string }) => {
    if (direction === "rising")
      return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
    if (direction === "declining")
      return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const scoreBadgeClass = (score: number) => {
    if (score >= 70) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (score >= 40)
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-red-500/10 text-red-500 border-red-500/20";
  };

  const competitionBadgeClass = (level: string) => {
    if (level === "low")
      return "bg-green-500/10 text-green-500 border-green-500/20";
    if (level === "medium")
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-red-500/10 text-red-500 border-red-500/20";
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Channel Starter</h1>
        <p className="text-muted-foreground mt-1">
          Discover your perfect YouTube niche backed by real data, then get a
          complete content plan.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-1">
        {STEP_NAMES.map((name, i) => {
          const step = (i + 1) as WizardStep;
          const isActive = currentStep === step;
          const isCompleted = completedSteps.has(step);
          const isClickable = isCompleted && !loading;

          return (
            <div key={name} className="flex items-center flex-1">
              <button
                disabled={!isClickable}
                onClick={() => isClickable && setCurrentStep(step)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all w-full ${
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/20 shadow-sm"
                    : isCompleted
                      ? "bg-primary/5 text-primary/70 border border-primary/10 hover:bg-primary/10 cursor-pointer"
                      : "bg-muted/50 text-muted-foreground border border-transparent"
                }`}
              >
                <span
                  className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted
                        ? "bg-primary/20 text-primary"
                        : "bg-muted-foreground/20 text-muted-foreground"
                  }`}
                >
                  {isCompleted && !isActive ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    step
                  )}
                </span>
                <span className="hidden sm:inline">{name}</span>
              </button>
              {i < STEP_NAMES.length - 1 && (
                <div
                  className={`h-px w-2 shrink-0 ${
                    isCompleted ? "bg-primary/30" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Loading Indicator */}
      {loading && (
        <Card className="border-primary/20">
          <CardContent className="py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">{LOADING_LABELS[loadingPhase]}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentStep === 2
                    ? "This may take 30-60 seconds — validating each niche with real data"
                    : "This usually takes 10-15 seconds"}
                </p>
              </div>
              {currentStep === 2 && (
                <div className="flex gap-2 mt-2">
                  {(
                    ["generating", "validating", "trends", "analyzing"] as const
                  ).map((phase) => {
                    const phases = [
                      "generating",
                      "validating",
                      "trends",
                      "analyzing",
                    ] as const;
                    const currentIdx = phases.indexOf(
                      loadingPhase as (typeof phases)[number]
                    );
                    const phaseIdx = phases.indexOf(phase);
                    return (
                      <div
                        key={phase}
                        className={`h-2 w-14 rounded-full transition-all duration-500 ${
                          phase === loadingPhase
                            ? "bg-primary shadow-sm shadow-primary/30"
                            : phaseIdx < currentIdx
                              ? "bg-primary/40"
                              : "bg-muted"
                        }`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 1: About You ───────────────────────────── */}
      {currentStep === 1 && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Tell Us About You
              <Badge variant="secondary" className="text-[10px]">
                Optional
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Share your interests and constraints so we can suggest niches
              tailored to you. Or skip for broad discovery.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label>Interests & Passions</Label>
                <Textarea
                  placeholder="e.g., history, psychology, gaming, cooking..."
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated
                </p>
              </div>

              <div className="space-y-2">
                <Label>Skills & Expertise</Label>
                <Textarea
                  placeholder="e.g., video editing, writing, data analysis..."
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="space-y-2">
                <Label>Budget</Label>
                <Select
                  value={budget}
                  onValueChange={(v) =>
                    setBudget(v as "low" | "medium" | "high")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (free tools only)</SelectItem>
                    <SelectItem value="medium">
                      Medium (some paid tools)
                    </SelectItem>
                    <SelectItem value="high">
                      High (professional setup)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Hours per week</Label>
                <Input
                  type="number"
                  min={1}
                  max={80}
                  value={hoursPerWeek}
                  onChange={(e) =>
                    setHoursPerWeek(parseInt(e.target.value) || 10)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Content type</Label>
                <Select
                  value={contentType}
                  onValueChange={(v) =>
                    setContentType(
                      v as "long-form" | "short-form" | "both" | "shorts"
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long-form">Long-form</SelectItem>
                    <SelectItem value="short-form">Short-form</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="shorts">Shorts only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="faceless"
                checked={faceless}
                onCheckedChange={(c) => setFaceless(c === true)}
              />
              <Label htmlFor="faceless" className="cursor-pointer">
                Faceless content only (no on-camera)
              </Label>
            </div>

            <div className="space-y-2">
              <Label>Goals</Label>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map((goal) => (
                  <button
                    key={goal}
                    onClick={() =>
                      setGoals((prev) =>
                        prev.includes(goal)
                          ? prev.filter((g) => g !== goal)
                          : [...prev, goal]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      goals.includes(goal)
                        ? "bg-primary/15 text-primary border-primary/20"
                        : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted"
                    }`}
                  >
                    {goal}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleContinueProfile}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Discover Niches
              </Button>
              <Button variant="ghost" onClick={handleSkipProfile}>
                <SkipForward className="h-4 w-4 mr-2" />
                Skip — Show Me Everything
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Niche Discovery ─────────────────────── */}
      {currentStep === 2 && !loading && niches.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Compass className="h-5 w-5 text-primary" />
              {niches.length} Niches Discovered
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(1)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Each niche has been validated with real YouTube data. Select one to
            explore further.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {niches.map((niche) => {
              const isSelected = selectedNiche?.name === niche.name;
              return (
                <Card
                  key={niche.name}
                  className={`cursor-pointer transition-all hover:border-primary/30 ${
                    isSelected ? "ring-2 ring-primary border-primary/30" : ""
                  }`}
                  onClick={() => setSelectedNiche(niche)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-sm">{niche.name}</h3>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <Badge className={scoreBadgeClass(niche.opportunityScore)}>
                          {niche.opportunityScore}%
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {niche.description}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        className={competitionBadgeClass(
                          niche.competitionLevel
                        )}
                      >
                        {niche.competitionLevel} competition
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="gap-1 text-[10px]"
                      >
                        <TrendIcon direction={niche.trendDirection} />
                        {niche.trendDirection}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {niche.contentTypeThatWorks}
                      </Badge>
                    </div>

                    {niche.whyItFits && (
                      <p className="text-xs text-primary/80 italic">
                        {niche.whyItFits}
                      </p>
                    )}

                    {niche.exampleOutliers.length > 0 && (
                      <div className="flex gap-2 pt-1">
                        {niche.exampleOutliers.slice(0, 2).map((ex) => (
                          <div
                            key={ex.id}
                            className="flex-1 rounded overflow-hidden border border-border"
                          >
                            <img
                              src={ex.thumbnailUrl}
                              alt={ex.title}
                              className="w-full h-16 object-cover"
                            />
                            <div className="p-1.5">
                              <p className="text-[10px] line-clamp-1 font-medium">
                                {ex.title}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {ex.views.toLocaleString()} views &middot;{" "}
                                {ex.outlierScore}x
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {selectedNiche && (
            <div className="flex justify-center pt-2">
              <Button onClick={handleDeepDive} size="lg">
                <Search className="h-4 w-4 mr-2" />
                Deep Dive into &ldquo;{selectedNiche.name}&rdquo;
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Deep Dive ───────────────────────────── */}
      {currentStep === 3 && !loading && deepDive && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Deep Dive: {deepDive.nicheName}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(2)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Pick Different Niche
            </Button>
          </div>

          {/* Top Formats */}
          {deepDive.topFormats.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Layout className="h-4 w-4 text-blue-500" />
                Top Performing Formats
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {deepDive.topFormats.map((format, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <p className="font-medium text-sm">{format.format}</p>
                      <p className="text-xs text-muted-foreground">
                        {format.whyItWorks}
                      </p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {format.exampleTitles.map((t, j) => (
                          <Badge
                            key={j}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Keyword Opportunities */}
          {deepDive.keywordOpportunities.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-green-500" />
                Keyword Opportunities
              </h3>
              <div className="space-y-2">
                {deepDive.keywordOpportunities.map((kw, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{kw.keyword}</p>
                        <div className="flex gap-1.5">
                          {kw.videoIdeas.map((idea, j) => (
                            <Badge
                              key={j}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {idea}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0 ml-3">
                        <Badge variant="secondary" className="text-[10px]">
                          Vol: {kw.searchVolume}
                        </Badge>
                        <Badge
                          className={`text-[10px] ${competitionBadgeClass(kw.competition.toLowerCase())}`}
                        >
                          {kw.competition}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Competitor Landscape */}
          {deepDive.competitorLandscape.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-orange-500" />
                Competitor Landscape
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {deepDive.competitorLandscape.map((ch, i) => (
                  <Card key={i}>
                    <CardContent className="p-3 space-y-1">
                      <p className="text-sm font-medium">{ch.channelName}</p>
                      <p className="text-xs text-muted-foreground">
                        {ch.subscribers.toLocaleString()} subs &middot; ~
                        {ch.avgViews.toLocaleString()} avg views
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ch.contentFocus}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Audience Insights */}
          {deepDive.audienceInsights.demographic && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  Audience Insights
                </h3>
                <p className="text-sm text-muted-foreground">
                  {deepDive.audienceInsights.demographic}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium mb-1">Pain Points</p>
                    <ul className="space-y-1">
                      {deepDive.audienceInsights.painPoints.map((p, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex gap-1.5"
                        >
                          <span className="text-red-500 shrink-0">&bull;</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-1">
                      Content Preferences
                    </p>
                    <ul className="space-y-1">
                      {deepDive.audienceInsights.contentPreferences.map(
                        (p, i) => (
                          <li
                            key={i}
                            className="text-xs text-muted-foreground flex gap-1.5"
                          >
                            <span className="text-green-500 shrink-0">
                              &bull;
                            </span>
                            {p}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gap Analysis */}
          {deepDive.gapAnalysis && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Gap Analysis — Your Opportunity
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {deepDive.gapAnalysis}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center pt-2">
            <Button onClick={handleStrategy} size="lg">
              <Sparkles className="h-4 w-4 mr-2" />
              Build Content Strategy
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Content Strategy ────────────────────── */}
      {currentStep === 4 && !loading && strategy && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Content Strategy
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(3)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>

          {/* Posting Schedule */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-500" />
                Posting Schedule
              </h3>
              <p className="text-sm font-medium">
                {strategy.postingSchedule.frequency}
              </p>
              <div className="flex gap-2">
                {strategy.postingSchedule.bestDays.map((day) => (
                  <Badge key={day} variant="secondary">
                    {day}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {strategy.postingSchedule.reasoning}
              </p>
            </CardContent>
          </Card>

          {/* Content Pillars */}
          {strategy.contentPillars.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Layout className="h-4 w-4 text-green-500" />
                Content Pillars
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {strategy.contentPillars.map((pillar, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm">{pillar.name}</p>
                        <Badge
                          variant="secondary"
                          className="text-[10px] shrink-0"
                        >
                          {pillar.percentage}%
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {pillar.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {pillar.exampleTopics.map((topic, j) => (
                          <Badge
                            key={j}
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Channel Positioning */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" />
                Channel Positioning
              </h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium">Unique Angle</p>
                  <p className="text-sm text-muted-foreground">
                    {strategy.channelPositioning.uniqueAngle}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium">Value Proposition</p>
                  <p className="text-sm text-muted-foreground">
                    {strategy.channelPositioning.valueProposition}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium">Differentiator</p>
                  <p className="text-sm text-muted-foreground">
                    {strategy.channelPositioning.differentiator}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Growth Roadmap */}
          {strategy.growthStrategy.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Rocket className="h-4 w-4 text-orange-500" />
                Growth Roadmap
              </h3>
              <div className="space-y-3">
                {strategy.growthStrategy.map((phase, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {i + 1}
                        </div>
                        <p className="font-medium text-sm">{phase.phase}</p>
                      </div>
                      <ul className="space-y-1 ml-8">
                        {phase.actions.map((action, j) => (
                          <li
                            key={j}
                            className="text-xs text-muted-foreground flex gap-1.5"
                          >
                            <span className="text-primary shrink-0">
                              &bull;
                            </span>
                            {action}
                          </li>
                        ))}
                      </ul>
                      <div className="ml-8">
                        <Badge variant="secondary" className="text-[10px]">
                          <Trophy className="h-3 w-3 mr-1" />
                          {phase.milestoneGoal}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Channel Names */}
          {strategy.channelNames.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">
                  Channel Name Suggestions
                </h3>
                <div className="flex flex-wrap gap-2">
                  {strategy.channelNames.map((name, i) => (
                    <button
                      key={i}
                      onClick={() => copyToClipboard(name, `name-${i}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-sm hover:bg-muted transition-all"
                    >
                      {name}
                      {copiedId === `name-${i}` ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Channel Description */}
          {strategy.channelDescription && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Channel Description
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() =>
                      copyToClipboard(strategy.channelDescription, "desc")
                    }
                  >
                    {copiedId === "desc" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                  {strategy.channelDescription}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center pt-2">
            <Button onClick={handleContentPlan} size="lg">
              <Lightbulb className="h-4 w-4 mr-2" />
              Generate Content Plan
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 5: Content Plan ─────────────────────────── */}
      {currentStep === 5 && !loading && contentPlan && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Your First 10 Videos
            </h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (
                    openCards.size ===
                    (contentPlan?.videos?.length ?? 0)
                  ) {
                    setOpenCards(new Set());
                  } else {
                    setOpenCards(
                      new Set(
                        contentPlan.videos.map((v) => `video-${v.number}`)
                      )
                    );
                  }
                }}
              >
                {openCards.size === (contentPlan?.videos?.length ?? 0)
                  ? "Collapse All"
                  : "Expand All"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentStep(4)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </div>
          </div>

          {/* First Video Advice */}
          {contentPlan.firstVideoAdvice && (
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Star className="h-4 w-4 text-yellow-500" />
                  First Video Advice
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {contentPlan.firstVideoAdvice}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Publishing Order */}
          {contentPlan.publishingOrder && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  Publishing Order
                </h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {contentPlan.publishingOrder}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Video Ideas */}
          <div className="space-y-3">
            {contentPlan.videos.map((video) => {
              const cardId = `video-${video.number}`;
              const isOpen = openCards.has(cardId);
              const isFirst = video.number === 1;

              return (
                <Card
                  key={video.number}
                  className={isFirst ? "border-yellow-500/20" : ""}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => toggleCard(cardId)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              isFirst
                                ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                : "bg-primary/10 text-primary border-primary/20"
                            }
                          >
                            #{video.number}
                          </Badge>
                          <CardTitle className="text-sm">
                            {video.titleOptions[0]}
                          </CardTitle>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {video.contentPillar}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            {video.estimatedLength}
                          </Badge>
                          {isOpen ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </button>

                  {isOpen && (
                    <CardContent className="space-y-4 pt-0">
                      {/* Alt Titles */}
                      {video.titleOptions.length > 1 && (
                        <div>
                          <p className="text-xs font-medium mb-1">
                            Alternative Titles
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {video.titleOptions.slice(1).map((t, i) => (
                              <Badge
                                key={i}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Hook Script */}
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
                                copyToClipboard(
                                  video.hookScript,
                                  `hook-${video.number}`
                                )
                              }
                            >
                              {copiedId === `hook-${video.number}` ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3 text-sm italic whitespace-pre-wrap">
                            {video.hookScript}
                          </div>
                        </div>

                        {/* Content Outline */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Layout className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium">
                              Content Outline
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {video.contentOutline}
                          </p>
                        </div>

                        {/* Thumbnail Concept */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <ImageIcon className="h-4 w-4 text-purple-500" />
                            <span className="text-sm font-medium">
                              Thumbnail Concept
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {video.thumbnailConcept}
                          </p>
                        </div>

                        {/* Why It Works */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 text-yellow-500" />
                            <span className="text-sm font-medium">
                              Why It Works for New Channels
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {video.whyItWorksForNewChannel}
                          </p>
                        </div>
                      </div>

                      {/* Target Keywords */}
                      {video.targetKeywords.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">
                            Keywords:
                          </span>
                          {video.targetKeywords.map((kw, i) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-[10px]"
                            >
                              {kw}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
