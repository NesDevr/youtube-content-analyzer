import crypto from "crypto";
import { prisma } from "./prisma";

const TTL_MS: Record<string, number> = {
  discover: 7 * 24 * 60 * 60 * 1000,    // 7 days
  "deep-dive": 3 * 24 * 60 * 60 * 1000, // 3 days
  strategy: 3 * 24 * 60 * 60 * 1000,    // 3 days
  "content-plan": 3 * 24 * 60 * 60 * 1000, // 3 days
};

export function hashInputs(...args: unknown[]): string {
  const normalized = JSON.stringify(args);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

export async function getCachedAiResponse(
  inputHash: string,
  endpoint: string
): Promise<string | null> {
  const cached = await prisma.aiCache.findUnique({ where: { inputHash } });
  if (!cached) return null;

  const ttl = TTL_MS[endpoint] ?? 3 * 24 * 60 * 60 * 1000;
  const age = Date.now() - cached.createdAt.getTime();
  if (age > ttl) {
    await prisma.aiCache.delete({ where: { inputHash } }).catch(() => {});
    return null;
  }

  console.log(`[AI Cache] HIT for ${endpoint} (age: ${Math.round(age / 3600000)}h)`);
  return cached.response;
}

export async function setCachedAiResponse(
  inputHash: string,
  endpoint: string,
  response: string
): Promise<void> {
  await prisma.aiCache.upsert({
    where: { inputHash },
    update: { response, createdAt: new Date() },
    create: { inputHash, endpoint, response },
  });
}
