import { ai, MODEL } from "./gemini";
import type {
  UserProfile,
  RawNiche,
  NicheDeepDive,
  ContentStrategy,
  StarterContentPlan,
} from "@/types/channel-starter";

export async function discoverNiches(
  profile: UserProfile | null
): Promise<{ niches: RawNiche[] }> {
  const profileSection = profile
    ? `The user has provided the following about themselves:
- Interests/Passions: ${profile.interests.join(", ")}
- Skills/Expertise: ${profile.skills.join(", ")}
- Constraints: ${profile.constraints.faceless ? "Faceless content only" : "On-camera OK"}, Budget: ${profile.constraints.budget}, ${profile.constraints.hoursPerWeek} hours/week
- Goals: ${profile.goals.join(", ")}
- Preferred content type: ${profile.contentType}

Tailor your niche suggestions to fit this profile. For each niche, include a "whyItFits" field explaining why it matches the user's profile.`
    : `The user has not provided personal details. Generate broadly promising YouTube niches that have high opportunity and low competition in 2024-2026. Do NOT include a "whyItFits" field.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube niche research expert. Your job is to identify promising YouTube niches where NEW creators (0 subscribers) can realistically grow.

${profileSection}

Generate 8-10 niche suggestions. For each niche, provide:
- A clear niche name (2-5 words, specific enough to search for)
- A description of what content in this niche looks like (1-2 sentences)
- 2-3 YouTube search keywords that VIEWERS would type to find videos in this niche. These must be actual viewer search terms, NOT creator/meta keywords.
- What content type works best in this niche

CRITICAL RULES:
- Focus on niches where small channels CAN compete — avoid niches dominated exclusively by massive creators
- Include a mix of evergreen and trending niches
- Be specific: "AI productivity tools" is better than "technology"
- Search keywords must be what VIEWERS type, not creators. Good: "how to budget in your 20s". Bad: "personal finance niche ideas"
- Consider niches across different categories: education, entertainment, lifestyle, tech, health, storytelling, etc.

Return as JSON:
{
  "niches": [
    {
      "name": "Niche Name",
      "description": "What content looks like in this niche",
      "searchKeywords": ["viewer keyword 1", "viewer keyword 2"],
      "contentTypeThatWorks": "Long-form deep dives / Shorts / etc",
      ${profile ? '"whyItFits": "Why this matches the user profile"' : ""}
    }
  ]
}`,
    config: {
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    return { niches: [] };
  }
}

export async function generateNicheDeepDive(
  nicheName: string,
  outlierData: {
    title: string;
    channelName: string;
    views: number;
    subscribers: number;
    outlierScore: number;
  }[],
  relatedQueries: { query: string; value: number | string }[],
  channelData: { name: string; subscribers: number; avgViews: number }[]
): Promise<NicheDeepDive> {
  const outlierSummary = outlierData
    .slice(0, 8)
    .map(
      (v, i) =>
        `${i + 1}. "${v.title}" by ${v.channelName} — ${v.views.toLocaleString()} views, ${v.subscribers.toLocaleString()} subs, ${v.outlierScore}x outlier`
    )
    .join("\n");

  const querySummary = relatedQueries
    .slice(0, 12)
    .map((q) => `- "${q.query}" (value: ${q.value})`)
    .join("\n");

  const channelSummary = channelData
    .slice(0, 10)
    .map(
      (c) =>
        `- ${c.name}: ${c.subscribers.toLocaleString()} subs, ~${Math.round(c.avgViews).toLocaleString()} avg views`
    )
    .join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube niche analyst. Perform a deep dive analysis of the "${nicheName}" niche using REAL DATA provided below.

=== OUTLIER VIDEOS (small channels with viral hits) ===
${outlierSummary || "No outlier data available"}

=== RELATED SEARCH QUERIES (from Google Trends) ===
${querySummary || "No related query data available"}

=== ACTIVE CHANNELS IN THIS NICHE ===
${channelSummary || "No channel data available"}

Based on this real data, provide a comprehensive analysis:

Return as JSON:
{
  "nicheName": "${nicheName}",
  "topFormats": [
    {
      "format": "Format name (e.g., 'Documentary-style deep dives')",
      "whyItWorks": "Why this format succeeds in this niche based on the data",
      "exampleTitles": ["Example title 1", "Example title 2", "Example title 3"]
    }
  ],
  "keywordOpportunities": [
    {
      "keyword": "Specific keyword/topic",
      "searchVolume": "High/Medium/Low based on trends data",
      "competition": "Low/Medium/High based on channel landscape",
      "videoIdeas": ["Specific video idea using this keyword", "Another idea"]
    }
  ],
  "competitorLandscape": [
    {
      "channelName": "Channel name from the data",
      "subscribers": 50000,
      "avgViews": 25000,
      "contentFocus": "What they primarily cover"
    }
  ],
  "audienceInsights": {
    "demographic": "Who watches this content (age, interests, background)",
    "painPoints": ["What problems/questions the audience has"],
    "contentPreferences": ["What formats/styles they prefer"]
  },
  "gapAnalysis": "A paragraph identifying GAPS in the current niche — what topics are underserved, what angles are missing, where a new creator could differentiate. Base this on the data above."
}

Generate 3-5 top formats, 5-8 keyword opportunities, and use the actual channel data for the competitor landscape. Be specific and data-driven.`,
    config: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    return {
      nicheName,
      topFormats: [],
      keywordOpportunities: [],
      competitorLandscape: [],
      audienceInsights: {
        demographic: "",
        painPoints: [],
        contentPreferences: [],
      },
      gapAnalysis: "",
    };
  }
}

export async function generateContentStrategy(
  nicheName: string,
  deepDive: NicheDeepDive,
  profile: UserProfile | null
): Promise<ContentStrategy> {
  const constraintsSection = profile
    ? `
Creator constraints:
- Content style: ${profile.constraints.faceless ? "Faceless only" : "On-camera OK"}
- Budget: ${profile.constraints.budget}
- Available time: ${profile.constraints.hoursPerWeek} hours/week
- Goals: ${profile.goals.join(", ")}
- Preferred format: ${profile.contentType}
- Skills: ${profile.skills.join(", ")}

Tailor the strategy to these constraints.`
    : "No creator constraints provided — generate a general-purpose strategy.";

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube growth strategist. Create a comprehensive content strategy for a NEW channel (0 subscribers) in the "${nicheName}" niche.

=== NICHE ANALYSIS ===
Top formats: ${deepDive.topFormats.slice(0, 3).map((f) => f.format).join(", ")}
Top keywords: ${deepDive.keywordOpportunities.slice(0, 3).map((k) => k.keyword).join(", ")}
Audience: ${deepDive.audienceInsights.demographic}
Gap analysis: ${deepDive.gapAnalysis}

${constraintsSection}

Return as JSON:
{
  "postingSchedule": {
    "frequency": "How often to post (e.g., '2 videos per week')",
    "bestDays": ["Tuesday", "Thursday"],
    "reasoning": "Why this schedule works for this niche and the creator's available time"
  },
  "contentPillars": [
    {
      "name": "Pillar name",
      "description": "What this pillar covers and why it matters",
      "percentage": 40,
      "exampleTopics": ["Topic 1", "Topic 2", "Topic 3"]
    }
  ],
  "channelPositioning": {
    "uniqueAngle": "What makes this channel different from existing ones",
    "valueProposition": "The core promise to viewers — why they should subscribe",
    "differentiator": "The specific edge this new channel has over established ones"
  },
  "growthStrategy": [
    {
      "phase": "Phase name (e.g., 'Phase 1: First 100 subscribers')",
      "actions": ["Specific action 1", "Specific action 2"],
      "milestoneGoal": "What success looks like at this phase"
    }
  ],
  "channelNames": ["Name idea 1", "Name idea 2", "Name idea 3", "Name idea 4", "Name idea 5"],
  "channelDescription": "A ready-to-use YouTube channel description (About section)"
}

Generate 3-4 content pillars that add up to ~100%. Create 3-4 growth phases from 0 to 10,000 subscribers. Channel names should be memorable, brandable, and available (avoid generic terms).`,
    config: {
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    return {
      postingSchedule: { frequency: "", bestDays: [], reasoning: "" },
      contentPillars: [],
      channelPositioning: {
        uniqueAngle: "",
        valueProposition: "",
        differentiator: "",
      },
      growthStrategy: [],
      channelNames: [],
      channelDescription: "",
    };
  }
}

export async function generateStarterContentPlan(
  nicheName: string,
  strategy: ContentStrategy,
  deepDive: NicheDeepDive
): Promise<StarterContentPlan> {
  const pillars = strategy.contentPillars
    .map((p) => `- ${p.name} (${p.percentage}%): ${p.description}`)
    .join("\n");

  const keywords = deepDive.keywordOpportunities
    .slice(0, 5)
    .map((k) => `- "${k.keyword}" (volume: ${k.searchVolume}, competition: ${k.competition})`)
    .join("\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube content planner. Create a detailed 10-video starter content plan for a NEW channel in the "${nicheName}" niche.

=== CONTENT STRATEGY ===
Posting schedule: ${strategy.postingSchedule.frequency}
Channel positioning: ${strategy.channelPositioning.uniqueAngle}
Value proposition: ${strategy.channelPositioning.valueProposition}

Content pillars:
${pillars}

=== KEYWORD OPPORTUNITIES ===
${keywords}

=== FORMATS THAT WORK ===
${deepDive.topFormats.map((f) => `- ${f.format}`).join("\n")}

Create 10 specific video ideas, distributed across the content pillars proportionally. The first few videos should be the most likely to get views and attract subscribers.

Return as JSON:
{
  "videos": [
    {
      "number": 1,
      "titleOptions": ["Primary title", "Alternative title 1", "Alternative title 2"],
      "hookScript": "The exact first 30 seconds of script — word for word. Make it attention-grabbing. Start with a surprising fact, bold claim, or compelling question.",
      "contentOutline": "Section-by-section outline: Intro (0:00-0:30) → ..., Section 1 (0:30-3:00) → ..., etc. Include what happens in each section.",
      "thumbnailConcept": "Specific thumbnail description: what image, text overlay, colors, style. Concrete enough for a designer to create.",
      "targetKeywords": ["keyword1", "keyword2"],
      "whyItWorksForNewChannel": "Why this specific video is good for a channel with 0 subscribers — consider searchability, shareability, and audience appeal",
      "estimatedLength": "8-12 minutes",
      "contentPillar": "Which pillar this belongs to"
    }
  ],
  "publishingOrder": "Explanation of why these videos are ordered this way — why video #1 should be first, etc.",
  "firstVideoAdvice": "Specific advice for the very first video: what to focus on, what to avoid, production tips for a brand new creator"
}

Make each video concrete and actionable. Hook scripts should be compelling and specific to each topic. Distribute videos across pillars roughly matching the percentage split.`,
    config: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    return {
      videos: [],
      publishingOrder: "",
      firstVideoAdvice: "",
    };
  }
}
