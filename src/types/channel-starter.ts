// ── Step 1: User Profile ────────────────────────────────

export interface UserProfile {
  interests: string[];
  skills: string[];
  constraints: {
    faceless: boolean;
    budget: "low" | "medium" | "high";
    hoursPerWeek: number;
  };
  goals: string[];
  contentType: "long-form" | "short-form" | "both" | "shorts";
}

// ── Step 2: Niche Discovery ─────────────────────────────

export interface OutlierExample {
  id: string;
  title: string;
  channelName: string;
  views: number;
  channelSubscribers: number;
  outlierScore: number;
  thumbnailUrl: string;
}

export interface NicheSuggestion {
  name: string;
  description: string;
  opportunityScore: number;
  competitionLevel: "low" | "medium" | "high";
  trendDirection: "rising" | "stable" | "declining";
  trendData: { date: string; value: number }[];
  contentTypeThatWorks: string;
  exampleOutliers: OutlierExample[];
  whyItFits?: string;
  searchKeywords: string[];
}

// Raw niche from Gemini before validation
export interface RawNiche {
  name: string;
  description: string;
  searchKeywords: string[];
  contentTypeThatWorks: string;
  whyItFits?: string;
}

// ── Step 3: Niche Deep Dive ─────────────────────────────

export interface NicheDeepDive {
  nicheName: string;
  topFormats: {
    format: string;
    whyItWorks: string;
    exampleTitles: string[];
  }[];
  keywordOpportunities: {
    keyword: string;
    searchVolume: string;
    competition: string;
    videoIdeas: string[];
  }[];
  competitorLandscape: {
    channelName: string;
    subscribers: number;
    avgViews: number;
    contentFocus: string;
  }[];
  audienceInsights: {
    demographic: string;
    painPoints: string[];
    contentPreferences: string[];
  };
  gapAnalysis: string;
}

// ── Step 4: Content Strategy ────────────────────────────

export interface ContentStrategy {
  postingSchedule: {
    frequency: string;
    bestDays: string[];
    reasoning: string;
  };
  contentPillars: {
    name: string;
    description: string;
    percentage: number;
    exampleTopics: string[];
  }[];
  channelPositioning: {
    uniqueAngle: string;
    valueProposition: string;
    differentiator: string;
  };
  growthStrategy: {
    phase: string;
    actions: string[];
    milestoneGoal: string;
  }[];
  channelNames: string[];
  channelDescription: string;
}

// ── Step 5: Starter Content Plan ────────────────────────

export interface VideoIdea {
  number: number;
  titleOptions: string[];
  hookScript: string;
  contentOutline: string;
  thumbnailConcept: string;
  targetKeywords: string[];
  whyItWorksForNewChannel: string;
  estimatedLength: string;
  contentPillar: string;
}

export interface StarterContentPlan {
  videos: VideoIdea[];
  publishingOrder: string;
  firstVideoAdvice: string;
}

// ── Wizard State ────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface WizardState {
  currentStep: WizardStep;
  profile: UserProfile | null;
  niches: NicheSuggestion[];
  selectedNiche: NicheSuggestion | null;
  deepDive: NicheDeepDive | null;
  strategy: ContentStrategy | null;
  contentPlan: StarterContentPlan | null;
  discoveryId: number | null;
}
