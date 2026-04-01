import { GoogleGenAI } from "@google/genai";
import { GOOGLE_PROJECT_ID, GOOGLE_CLOUD_LOCATION } from "./env";

export const ai = new GoogleGenAI({
  vertexai: true,
  project: GOOGLE_PROJECT_ID,
  location: GOOGLE_CLOUD_LOCATION,
});

export const MODEL = "gemini-2.5-pro";

export async function generateKeywords(topic: string): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube research expert. Generate 20 search keywords/phrases that VIEWERS would type into YouTube search to find videos about "${topic}".

CRITICAL RULES:
- Generate keywords that real VIEWERS search for, NOT keywords about "starting a channel" or "faceless youtube"
- These should be actual video topics, NOT creator/business meta-keywords
- Think: what would someone type into YouTube if they wanted to WATCH a video about this topic?
- Include a mix of: specific topics, "explained" queries, "top 10" lists, story-based queries, comparison queries
- Vary specificity: some broad ("${topic} explained"), some niche ("${topic}" + specific subtopic)

GOOD examples for "stoicism": ["marcus aurelius life story", "stoic quotes that changed my life", "how to stop caring what people think", "ancient philosophy for modern life"]
BAD examples (DO NOT generate these): ["faceless stoicism channel", "viral stoicism niche", "stoicism youtube automation"]

Return ONLY a JSON array of strings, no other text. Example: ["keyword 1", "keyword 2"]`,
    config: {
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // JSON extraction failed
    }
    return [];
  }
}

export async function analyzeVideos(
  videos: {
    title: string;
    views: number;
    likes: number;
    channelName: string;
    channelSubscribers: number;
    outlierScore: number;
    description: string;
  }[]
): Promise<{
  analysis: string;
  ideas: {
    topic: string;
    hook: string;
    structure: string;
    thumbnailConcept: string;
    estimatedPotential: string;
  }[];
}> {
  const videoSummary = videos
    .map(
      (v, i) =>
        `${i + 1}. "${v.title}" by ${v.channelName}
   Views: ${v.views.toLocaleString()} | Likes: ${v.likes.toLocaleString()}
   Channel Subscribers: ${v.channelSubscribers.toLocaleString()}
   Outlier Score: ${v.outlierScore}x
   Description: ${v.description.slice(0, 200)}`
    )
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube content strategist analyzing viral videos to identify patterns and generate new content ideas.

Here are the viral/outlier videos to analyze:

${videoSummary}

Provide your analysis in the following JSON format:
{
  "analysis": "2-3 paragraph analysis of WHY these videos went viral — common patterns, hooks, formats, topics that resonated",
  "ideas": [
    {
      "topic": "Specific video topic/angle",
      "hook": "First 30 seconds script suggestion to hook viewers",
      "structure": "Video structure outline (intro, sections, conclusion)",
      "thumbnailConcept": "Thumbnail design concept description",
      "estimatedPotential": "Estimated view potential based on niche data (e.g., '100K-500K views based on niche average')"
    }
  ]
}

Generate 3-5 unique video ideas. Return ONLY valid JSON.`,
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
      analysis: text,
      ideas: [],
    };
  }
}

export async function summarizeVideo(
  title: string,
  transcript: string,
  views: number,
  likes: number
): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Summarize this YouTube video concisely. Focus on key points, arguments, and takeaways.

Title: "${title}"
Views: ${views.toLocaleString()} | Likes: ${likes.toLocaleString()}

Transcript:
${transcript.slice(0, 8000)}

Provide:
1. One-paragraph summary (3-4 sentences)
2. Key Takeaways (bullet points)
3. Why this video likely performed well (1-2 sentences)`,
    config: {
      maxOutputTokens: 2048,
    },
  });

  return response.text ?? "";
}

export async function deepAnalyzeVideos(
  videos: {
    title: string;
    channelName: string;
    views: number;
    likes: number;
    comments: number;
    duration: string;
    description: string;
    thumbnailUrl: string;
    transcript: string | null;
    channelSubscribers: number | null;
  }[]
): Promise<{
  analyses: {
    videoTitle: string;
    hookAnalysis: string;
    scriptStructure: string;
    contentPatterns: string;
    thumbnailAnalysis: string;
    whyItWorks: string;
    replicableTakeaways: string[];
  }[];
}> {
  const videoData = videos
    .map((v, i) => {
      const transcriptSection = v.transcript
        ? `\nTranscript (first ~15000 chars):\n${v.transcript.slice(0, 15000)}`
        : "\nTranscript: NOT AVAILABLE — analyze based on metadata and description only.";

      return `=== VIDEO ${i + 1}: "${v.title}" ===
Channel: ${v.channelName}${v.channelSubscribers ? ` (${v.channelSubscribers.toLocaleString()} subscribers)` : ""}
Views: ${v.views.toLocaleString()} | Likes: ${v.likes.toLocaleString()} | Comments: ${v.comments.toLocaleString()}
Duration: ${v.duration}
Description: ${v.description}
Thumbnail URL: ${v.thumbnailUrl}${transcriptSection}`;
    })
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are an elite YouTube content strategist. Analyze these videos in depth to understand exactly what makes them work so a creator can replicate their success.

For each video, provide a detailed breakdown:

${videoData}

Return your analysis as JSON in this exact format:
{
  "analyses": [
    {
      "videoTitle": "The exact video title",
      "hookAnalysis": "Detailed analysis of the first 30 seconds. What hook technique is used? How does it grab attention? What emotion does it trigger? If transcript is available, quote the exact opening lines and explain why they work.",
      "scriptStructure": "Break down the full script structure: how is the video organized? What's the pacing? How are transitions handled? Where are retention peaks likely? How does it maintain viewer interest throughout?",
      "contentPatterns": "What content patterns make this video engaging? Topic selection, storytelling techniques, information density, emotional beats, call-to-actions, audience engagement tactics.",
      "thumbnailAnalysis": "Based on the title, description, and content — what is likely in the thumbnail? Why would this thumbnail concept drive clicks? What curiosity gap or emotion does it create?",
      "whyItWorks": "Synthesize: why does this video perform well? What's the core formula? Consider the niche, timing, format, audience psychology, and content quality.",
      "replicableTakeaways": ["Specific, actionable takeaway 1 that a creator can apply to their own videos", "Takeaway 2", "Takeaway 3"]
    }
  ]
}

Be specific and actionable. Don't give generic advice — reference specific moments, techniques, and patterns from each video. If a transcript is not available, do your best analysis from the metadata and note that deeper script analysis wasn't possible.`,
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    return { analyses: [] };
  }
}

export async function generateInspiredIdeas(
  analyses: {
    videoTitle: string;
    hookAnalysis: string;
    scriptStructure: string;
    contentPatterns: string;
    whyItWorks: string;
    replicableTakeaways: string[];
  }[]
): Promise<{
  ideas: {
    title: string;
    hookScript: string;
    structureOutline: string;
    thumbnailConcept: string;
    whyItShouldWork: string;
    inspiredBy: string;
  }[];
}> {
  const analysisData = analyses
    .map(
      (a, i) =>
        `=== ANALYSIS ${i + 1}: "${a.videoTitle}" ===
Hook: ${a.hookAnalysis}
Structure: ${a.scriptStructure}
Patterns: ${a.contentPatterns}
Why it works: ${a.whyItWorks}
Takeaways: ${a.replicableTakeaways.join("; ")}`
    )
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube content strategist. Based on these analyses of successful videos, generate 3-5 NEW video concepts that are inspired by what works but are original and unique.

Here are the analyses of successful videos:

${analysisData}

Generate video concepts that take the winning patterns and apply them in fresh ways. Each concept should be something a creator could start working on immediately.

Return as JSON:
{
  "ideas": [
    {
      "title": "A compelling, click-worthy video title",
      "hookScript": "Write the actual first 30 seconds of script — word for word what the creator would say. Make it attention-grabbing using the hook techniques identified in the analysis.",
      "structureOutline": "Section-by-section outline: Intro (0:00-0:30) — ..., Section 1 (0:30-3:00) — ..., etc. Include timing estimates and what happens in each section.",
      "thumbnailConcept": "Specific thumbnail description: what image, what text overlay, what emotion/expression, what colors. Be concrete enough that a designer could create it.",
      "whyItShouldWork": "Explain the connection to the analyzed videos. What proven patterns does this concept leverage? Why would the target audience click and watch?",
      "inspiredBy": "Which analyzed video(s) this draws from and what specific elements"
    }
  ]
}

Be creative but grounded. Every idea should be backed by patterns that already proved to work in the analyzed videos.`,
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : text);
  } catch {
    return { ideas: [] };
  }
}

export async function brainstormKeywords(
  niche: string,
  context?: string
): Promise<{ keywords: string[]; reasoning: string }> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `You are a YouTube content research expert. Your job is to generate search keywords that VIEWERS type into YouTube to find videos.

Niche description: "${niche}"
${context ? `Additional context: ${context}` : ""}

Generate search keywords that real VIEWERS would type into YouTube. These keywords will be used to search YouTube and find viral videos worth studying/replicating.

CRITICAL RULES:
- Generate keywords that VIEWERS search for, NOT creator/business keywords
- NO meta-keywords like "faceless channel", "youtube automation", "niche research", "low competition"
- Think from the VIEWER's perspective: what would someone type to WATCH content in this niche?
- Include a mix of formats: "explained", "documentary", "top 10", "the truth about", "what happened to", "history of", story-based queries
- Include both broad and specific subtopics within the niche
- If the user mentions video length preferences, tailor keywords to topics that naturally support that format (e.g., documentaries, deep dives, full stories for long-form)

GOOD examples: ["how the universe was created", "darkest secrets of ancient egypt", "billionaires who lost everything"]
BAD examples (NEVER generate): ["faceless youtube channel ideas", "viral niche 2024", "youtube automation long videos"]

Return as JSON:
{
  "keywords": ["keyword1", "keyword2", ...],
  "reasoning": "Brief explanation of your keyword strategy and why these topics work for this niche"
}

Generate 20-30 keywords. Return ONLY valid JSON.`,
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
    return { keywords: [], reasoning: text };
  }
}
