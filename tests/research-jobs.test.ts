import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as listSeeds } from "@/app/api/evidence-seeds/route";
import { GET as listJobs, POST as jobAction } from "@/app/api/research-jobs/route";
import { GET as listIdeas, POST as ideaAction } from "@/app/api/ideas/route";

const BASE = "http://localhost/api";
const post = (url: string, body: unknown) => new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (url: string) => new NextRequest(url);

async function workspace(name: string) {
  return prisma.channelWorkspace.create({ data: { name } });
}

beforeEach(async () => {
  await prisma.channelWorkspace.deleteMany();
  await prisma.video.deleteMany();
});

describe("Milestone C research bridge", () => {
  it("queues selected saved evidence with workspace context and keeps it isolated", async () => {
    const alpha = await workspace("Research alpha");
    const beta = await workspace("Research beta");
    const folder = await prisma.folder.create({ data: { workspaceId: alpha.id, name: "Verified outliers" } });
    await prisma.video.create({ data: { id: "seed-video", title: "Evidence title", channelId: "UCseed", channelName: "Seed channel", views: 100, likes: 10, comments: 1, duration: "PT10M", publishedAt: new Date(), thumbnailUrl: "https://example.com/thumb.jpg" } });
    await prisma.folderVideo.create({ data: { folderId: folder.id, videoId: "seed-video" } });

    const seedResponse = await listSeeds(get(`${BASE}/evidence-seeds?workspaceId=${alpha.id}`));
    const seedBody = await seedResponse.json() as { seeds: { kind: string; id: string; label: string }[] };
    expect(seedBody.seeds).toContainEqual(expect.objectContaining({ kind: "video", id: "seed-video", label: "Evidence title" }));

    const created = await jobAction(post(`${BASE}/research-jobs`, { action: "create", workspaceId: alpha.id, intent: "Find an original angle", seeds: [{ kind: "video", id: "seed-video", label: "Evidence title" }], referenceCollectionIds: [] }));
    expect(created.status).toBe(201);
    const job = (await created.json() as { job: { id: number } }).job;
    const stored = await prisma.researchJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(JSON.parse(stored.input).workspace.name).toBe("Research alpha");

    const betaJobs = await listJobs(get(`${BASE}/research-jobs?workspaceId=${beta.id}`));
    expect((await betaJobs.json() as { jobs: unknown[] }).jobs).toHaveLength(0);
  });

  it("resumes a job without losing sourced evidence and prevents cross-workspace idea moves", async () => {
    const alpha = await workspace("Resume alpha");
    const beta = await workspace("Move beta");
    const job = await prisma.researchJob.create({ data: { workspaceId: alpha.id, status: "researching", intent: "Resume safely", input: "{}" } });
    await prisma.researchJobEvidence.create({ data: { researchJobId: job.id, url: "https://example.com/primary", sourceType: "primary", claim: "A sourced claim" } });

    const resumed = await jobAction(post(`${BASE}/research-jobs`, { action: "resume", workspaceId: alpha.id, id: job.id }));
    expect(resumed.status).toBe(200);
    expect((await prisma.researchJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("queued");
    expect(await prisma.researchJobEvidence.count({ where: { researchJobId: job.id } })).toBe(1);

    const idea = await prisma.idea.create({ data: { workspaceId: alpha.id, title: "Portable original idea" } });
    const moved = await ideaAction(post(`${BASE}/ideas`, { action: "update", workspaceId: alpha.id, id: idea.id, destinationWorkspaceId: beta.id, status: "shortlisted" }));
    expect(moved.status).toBe(200);
    const alphaIdeas = await listIdeas(get(`${BASE}/ideas?workspaceId=${alpha.id}`));
    expect((await alphaIdeas.json() as { ideas: unknown[] }).ideas).toHaveLength(0);
    const betaIdeas = await listIdeas(get(`${BASE}/ideas?workspaceId=${beta.id}`));
    expect((await betaIdeas.json() as { ideas: { status: string }[] }).ideas[0].status).toBe("shortlisted");
  });
});
