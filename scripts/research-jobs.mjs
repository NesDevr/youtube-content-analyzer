import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const prisma = new PrismaClient();
const [command, rawId, file] = process.argv.slice(2);
const id = Number(rawId);

function fail(message) {
  throw new Error(message);
}

function requireId() {
  if (!Number.isInteger(id) || id <= 0) fail("A positive research job id is required.");
}

async function readJson(path) {
  if (!path) fail("A JSON file path is required.");
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { fail(`Cannot read valid JSON from ${path}: ${error.message}`); }
}

function validateEvidence(evidence) {
  if (!Array.isArray(evidence)) fail("evidence must be an array.");
  for (const item of evidence) {
    if (!item || typeof item.url !== "string" || !/^https?:\/\//.test(item.url)) fail("Each evidence item requires an http(s) url.");
    if (!["primary", "commentary"].includes(item.sourceType)) fail("Each evidence item sourceType must be primary or commentary.");
    if (typeof item.claim !== "string" || !item.claim.trim()) fail("Each evidence item requires a claim.");
  }
}

function validateResult(result) {
  for (const key of ["conclusion", "claims", "counterarguments", "missingEvidence", "risks", "repeatability", "visualObservations", "ideas"]) {
    if (!(key in result)) fail(`Result is missing ${key}.`);
  }
  if (typeof result.conclusion !== "string" || !Array.isArray(result.claims) || !Array.isArray(result.counterarguments) || !Array.isArray(result.missingEvidence) || !Array.isArray(result.risks) || !Array.isArray(result.visualObservations) || !Array.isArray(result.ideas) || !["repeatable", "unproven", "not-repeatable"].includes(result.repeatability?.verdict) || !Array.isArray(result.repeatability?.siblingEvidence) || !Array.isArray(result.repeatability?.independentChannelEvidence)) {
    fail("Result does not match research-job-v1.");
  }
  for (const idea of result.ideas) {
    if (!idea?.title || !Array.isArray(idea.packages)) fail("Each idea needs a title and packages array.");
    for (const item of idea.packages) if (!item.title || !item.thumbnailDirection || !item.transferableMechanism || !item.distinctExecution || !Array.isArray(item.flags)) fail("Each package needs title, thumbnailDirection, transferableMechanism, distinctExecution, and flags.");
  }
}

async function getJob() {
  requireId();
  const job = await prisma.researchJob.findUnique({ where: { id }, include: { evidence: true, workspace: { select: { id: true, name: true, concept: true, constraints: true, positioning: true, language: true, targetAudience: true } } } });
  if (!job) fail(`Research job ${id} was not found.`);
  return job;
}

try {
  if (command === "list") {
    const workspaceId = rawId === undefined ? undefined : Number(rawId);
    if (workspaceId !== undefined && (!Number.isInteger(workspaceId) || workspaceId <= 0)) fail("workspaceId must be a positive integer.");
    const jobs = await prisma.researchJob.findMany({ where: workspaceId ? { workspaceId } : {}, select: { id: true, workspaceId: true, status: true, intent: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } });
    console.log(JSON.stringify(jobs, null, 2));
  } else if (command === "claim") {
    const job = await getJob();
    if (job.status !== "queued") fail(`Job ${id} is ${job.status}, not queued.`);
    const claimed = await prisma.researchJob.update({ where: { id }, data: { status: "researching", claimedAt: new Date(), error: null } });
    console.log(JSON.stringify(claimed, null, 2));
  } else if (command === "inspect") {
    console.log(JSON.stringify(await getJob(), null, 2));
  } else if (command === "update") {
    const job = await getJob();
    if (job.status !== "researching") fail(`Job ${id} must be researching before it can be updated.`);
    const progress = await readJson(file);
    validateEvidence(progress.evidence ?? []);
    if (progress.quotaUsed !== undefined && (!Number.isInteger(progress.quotaUsed) || progress.quotaUsed < 0 || progress.quotaUsed > job.quotaBudget)) fail("quotaUsed must be a non-negative integer within the job budget.");
    await prisma.$transaction([
      prisma.researchJobEvidence.deleteMany({ where: { researchJobId: id } }),
      prisma.researchJobEvidence.createMany({ data: progress.evidence.map(({ url, sourceType, title = "", claim, note = "" }) => ({ researchJobId: id, url, sourceType, title, claim, note })) }),
      prisma.researchJob.update({ where: { id }, data: { quotaUsed: progress.quotaUsed ?? job.quotaUsed } }),
    ]);
    console.log(JSON.stringify({ id, updatedEvidence: progress.evidence.length }, null, 2));
  } else if (command === "complete") {
    const job = await getJob();
    if (job.status !== "researching") fail(`Job ${id} must be researching before it can be completed.`);
    const result = await readJson(file);
    validateResult(result);
    if (!job.evidence.length) fail("At least one sourced evidence item is required before completion.");
    const completed = await prisma.$transaction(async (tx) => {
      await tx.idea.createMany({ data: result.ideas.map((idea, rank) => ({ workspaceId: job.workspaceId, researchJobId: id, title: idea.title, audiencePromise: idea.audiencePromise ?? "", angle: idea.angle ?? "", evidenceLinks: JSON.stringify(idea.evidenceLinks ?? []), risks: idea.risks ?? "", freshness: idea.freshness ?? "", productionRequirements: idea.productionRequirements ?? "", confidence: idea.confidence ?? "unknown", rank, rejectedPackages: JSON.stringify(idea.packages), researchBrief: JSON.stringify({ conclusion: result.conclusion, claims: result.claims, counterarguments: result.counterarguments, missingEvidence: result.missingEvidence, risks: result.risks, repeatability: result.repeatability, visualObservations: result.visualObservations, sources: job.evidence.map(({ url, sourceType, title, claim }) => ({ url, sourceType, title, claim })), outline: [], titlePackages: idea.packages, productionRequirements: idea.productionRequirements ?? "" }) })) });
      return tx.researchJob.update({ where: { id }, data: { status: "completed", result: JSON.stringify(result), completedAt: new Date(), error: null } });
    });
    console.log(JSON.stringify(completed, null, 2));
  } else if (command === "resume") {
    const job = await getJob();
    if (job.status === "completed") fail("Completed jobs cannot be resumed.");
    const resumed = await prisma.researchJob.update({ where: { id }, data: { status: "queued", error: null, claimedAt: null } });
    console.log(JSON.stringify(resumed, null, 2));
  } else {
    fail("Usage: research:jobs <list [workspaceId] | claim <id> | inspect <id> | update <id> <progress.json> | complete <id> <result.json> | resume <id>>");
  }
} finally {
  await prisma.$disconnect();
}
