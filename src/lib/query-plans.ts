import { prisma } from "./prisma";

export const QUERY_PURPOSES = ["idea discovery", "topic validation", "counterevidence", "title mechanisms", "thumbnail mechanisms", "hooks", "cross-niche packaging"] as const;
const META = /\b(faceless|youtube automation|low competition|channel ideas?|niche research|creator meta)\b/i;

type PlanRow = { query: string; purpose: string; mechanism?: string; expectedEvidence?: string; sourceContext?: string; language?: string; region?: string; generationReason?: string; selected?: boolean };

export function validatePlanRows(rows: PlanRow[]): PlanRow[] {
  const seen = new Set<string>();
  return rows.map((row) => ({ ...row, query: row.query.trim() })).filter((row) => {
    const key = `${row.query.toLowerCase()}|${row.language ?? ""}|${row.region ?? ""}`;
    if (!row.query || row.query.length < 3 || META.test(row.query) || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

/**
 * Deterministic search suggestions for one question the user typed.
 *
 * The question is the only source of the wording: earlier versions fell back to
 * the workspace concept, which turned a placeholder like "ENFOQUE DEL CANAL"
 * into the query "ENFOQUE DEL CANAL explained". The workspace only supplies the
 * language and region every suggestion is scoped to, and every row stays
 * editable before anything is priced or run.
 */
const VARIANTS: Record<"es" | "en", Array<[(topic: string) => string, string, string, string]>> = {
  es: [
    [(t) => `cuánto cuesta ${t}`, "topic validation", "concrete numbers", "Adds the cost angle, which pulls videos that answer with real figures"],
    [(t) => `la verdad sobre ${t}`, "title mechanisms", "reveal", "Tests one title mechanism: the promised reveal"],
    [(t) => `${t} experiencia real`, "idea discovery", "first-hand account", "Looks for creators who lived it rather than summarised it"],
    [(t) => `por qué fracasa ${t}`, "counterevidence", "failure story", "Looks for disconfirming coverage and saturation signals"],
  ],
  en: [
    [(t) => `how much does ${t} cost`, "topic validation", "concrete numbers", "Adds the cost angle, which pulls videos that answer with real figures"],
    [(t) => `the truth about ${t}`, "title mechanisms", "reveal", "Tests one title mechanism: the promised reveal"],
    [(t) => `${t} real experience`, "idea discovery", "first-hand account", "Looks for creators who lived it rather than summarised it"],
    [(t) => `why ${t} fails`, "counterevidence", "failure story", "Looks for disconfirming coverage and saturation signals"],
  ],
};

export function suggestQueries(question: string, language: string, region: string): PlanRow[] {
  const topic = question.trim().replace(/\s+/g, " ");
  if (topic.length < 3) throw new Error("Write what you want to find before asking for suggestions.");
  if (META.test(topic)) throw new Error("That question is about being a creator, not about what a viewer searches for. Describe the subject of the videos you want to find.");

  const variants = VARIANTS[language.toLowerCase().startsWith("es") ? "es" : "en"];
  const rows = validatePlanRows([
    { query: topic, purpose: "idea discovery", mechanism: "", expectedEvidence: "Videos about exactly this subject", sourceContext: "your question", language, region, generationReason: "Your question, sent to YouTube unchanged" },
    ...variants.map(([build, purpose, mechanism, reason]) => ({
      query: build(topic), purpose, mechanism, expectedEvidence: "Independent channels covering the same subject", sourceContext: "your question", language, region, generationReason: reason,
    })),
  ]);
  if (!rows.length) throw new Error("No usable search could be built from that question.");
  return rows;
}

export async function planningContext(workspaceId: number) {
  const workspace = await prisma.channelWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const profile = await prisma.channelResearchProfile.findUnique({ where: { workspaceId } });
  return { workspace: { name: workspace.name, concept: workspace.concept, audience: workspace.targetAudience, language: workspace.language, country: workspace.country, format: workspace.contentFormat, positioning: workspace.positioning, constraints: workspace.constraints }, profile };
}
