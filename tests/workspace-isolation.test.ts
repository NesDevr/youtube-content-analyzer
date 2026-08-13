import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { GET as listFolders, POST as folderAction, DELETE as deleteFolder } from "@/app/api/folders/route";
import { GET as getFolder } from "@/app/api/folders/[id]/route";
import { GET as listPanels, POST as panelAction } from "@/app/api/panels/route";
import { GET as listWorkspaces, POST as workspaceAction } from "@/app/api/workspaces/route";

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(url: string) {
  return new NextRequest(url);
}

const BASE = "http://localhost/api";

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

async function createWorkspace(name: string): Promise<number> {
  const res = await workspaceAction(
    post(`${BASE}/workspaces`, { action: "create", name })
  );
  const body = await json<{ workspace: { id: number } }>(res);
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body.workspace.id;
}

async function createFolder(workspaceId: number, name: string): Promise<number> {
  const res = await folderAction(
    post(`${BASE}/folders`, { action: "create", name, workspaceId })
  );
  const body = await json<{ folder: { id: number } }>(res);
  expect(res.status, JSON.stringify(body)).toBe(200);
  return body.folder.id;
}

const SAMPLE_VIDEO = {
  id: "aaaaaaaaaaa",
  title: "Shared public evidence",
  channelId: "UC_test_channel",
  channelName: "Test Channel",
  views: 12345,
  likes: 100,
  comments: 5,
  duration: "PT10M1S",
  publishedAt: "2026-01-01T00:00:00.000Z",
  thumbnailUrl: "https://i.ytimg.com/vi/aaaaaaaaaaa/hqdefault.jpg",
  description: "",
  outlierScore: 2.5,
  viewsPerHour: 3,
};

describe("channel workspace isolation", () => {
  let alpha: number;
  let beta: number;

  beforeEach(async () => {
    await prisma.outlierAnalysis.deleteMany();
    await prisma.folderVideo.deleteMany();
    await prisma.ideaGeneration.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.panel.deleteMany();
    await prisma.nicheDiscovery.deleteMany();
    await prisma.video.deleteMany();
    await prisma.channelWorkspace.deleteMany();

    alpha = await createWorkspace("Alpha channel");
    beta = await createWorkspace("Beta channel");
  });

  it("lists only the folders of the requested workspace", async () => {
    await createFolder(alpha, "Alpha research");
    await createFolder(beta, "Beta research");

    const alphaBody = await json<{ folders: { name: string }[] }>(
      await listFolders(get(`${BASE}/folders?workspaceId=${alpha}`))
    );
    const betaBody = await json<{ folders: { name: string }[] }>(
      await listFolders(get(`${BASE}/folders?workspaceId=${beta}`))
    );

    expect(alphaBody.folders.map((f) => f.name)).toEqual(["Alpha research"]);
    expect(betaBody.folders.map((f) => f.name)).toEqual(["Beta research"]);
  });

  it("refuses to read a folder through the wrong workspace", async () => {
    const alphaFolder = await createFolder(alpha, "Alpha research");

    const ok = await getFolder(get(`${BASE}/folders/${alphaFolder}?workspaceId=${alpha}`), {
      params: Promise.resolve({ id: String(alphaFolder) }),
    });
    expect(ok.status).toBe(200);

    const leaked = await getFolder(
      get(`${BASE}/folders/${alphaFolder}?workspaceId=${beta}`),
      { params: Promise.resolve({ id: String(alphaFolder) }) }
    );
    expect(leaked.status).toBe(404);
  });

  it("refuses to write into another workspace's folder", async () => {
    const alphaFolder = await createFolder(alpha, "Alpha research");

    const res = await folderAction(
      post(`${BASE}/folders`, {
        action: "addVideo",
        folderId: alphaFolder,
        videoId: SAMPLE_VIDEO.id,
        workspaceId: beta,
        video: SAMPLE_VIDEO,
      })
    );

    expect(res.status).toBe(404);
    expect(await prisma.folderVideo.count()).toBe(0);
    // The video row must not be created as a side effect of a rejected write.
    expect(await prisma.video.count()).toBe(0);
  });

  it("refuses to delete another workspace's folder", async () => {
    const alphaFolder = await createFolder(alpha, "Alpha research");

    const res = await deleteFolder(
      get(`${BASE}/folders?id=${alphaFolder}&workspaceId=${beta}`)
    );

    expect(res.status).toBe(404);
    expect(await prisma.folder.count()).toBe(1);
  });

  it("keeps saved searches separate and refuses cross-workspace deletes", async () => {
    const alphaPanel = await json<{ panel: { id: number } }>(
      await panelAction(
        post(`${BASE}/panels`, {
          action: "create",
          name: "Alpha search",
          keyword: "alpha",
          workspaceId: alpha,
        })
      )
    );
    await panelAction(
      post(`${BASE}/panels`, {
        action: "create",
        name: "Beta search",
        keyword: "beta",
        workspaceId: beta,
      })
    );

    const alphaPanels = await json<{ panels: { name: string }[] }>(
      await listPanels(get(`${BASE}/panels?workspaceId=${alpha}`))
    );
    expect(alphaPanels.panels.map((p) => p.name)).toEqual(["Alpha search"]);

    const refreshFromWrongWorkspace = await panelAction(
      post(`${BASE}/panels`, {
        action: "refresh",
        id: alphaPanel.panel.id,
        workspaceId: beta,
      })
    );
    expect(refreshFromWrongWorkspace.status).toBe(404);
  });

  it("shares public video evidence across workspaces without sharing folders", async () => {
    const alphaFolder = await createFolder(alpha, "Alpha research");
    const betaFolder = await createFolder(beta, "Beta research");

    for (const [workspaceId, folderId] of [
      [alpha, alphaFolder],
      [beta, betaFolder],
    ]) {
      const res = await folderAction(
        post(`${BASE}/folders`, {
          action: "addVideo",
          folderId,
          videoId: SAMPLE_VIDEO.id,
          workspaceId,
          video: SAMPLE_VIDEO,
        })
      );
      expect(res.status).toBe(200);
    }

    // One global Video row, referenced from both workspaces' folders.
    expect(await prisma.video.count()).toBe(1);
    expect(await prisma.folderVideo.count()).toBe(2);

    const alphaDetail = await json<{ folder: { videos: unknown[] } }>(
      await getFolder(get(`${BASE}/folders/${alphaFolder}?workspaceId=${alpha}`), {
        params: Promise.resolve({ id: String(alphaFolder) }),
      })
    );
    expect(alphaDetail.folder.videos).toHaveLength(1);
  });

  it("rejects requests that do not name a workspace", async () => {
    const missing = await listFolders(get(`${BASE}/folders`));
    expect(missing.status).toBe(400);
    expect((await json<{ error: string }>(missing)).error).toMatch(/required/i);

    const unknown = await listFolders(get(`${BASE}/folders?workspaceId=999999`));
    expect(unknown.status).toBe(404);

    const invalid = await listFolders(get(`${BASE}/folders?workspaceId=abc`));
    expect(invalid.status).toBe(400);
  });
});

describe("workspace lifecycle", () => {
  beforeEach(async () => {
    await prisma.outlierAnalysis.deleteMany();
    await prisma.folderVideo.deleteMany();
    await prisma.ideaGeneration.deleteMany();
    await prisma.folder.deleteMany();
    await prisma.panel.deleteMany();
    await prisma.nicheDiscovery.deleteMany();
    await prisma.channelWorkspace.deleteMany();
  });

  it("creates, edits and archives without touching other workspaces", async () => {
    const id = await createWorkspace("Consumer cybersecurity");
    const other = await createWorkspace("Practical AI");

    const updated = await json<{ workspace: { concept: string; status: string } }>(
      await workspaceAction(
        post(`${BASE}/workspaces`, {
          action: "update",
          id,
          concept: "Scam teardowns for non-technical viewers",
          status: "active",
        })
      )
    );
    expect(updated.workspace.concept).toBe(
      "Scam teardowns for non-technical viewers"
    );
    expect(updated.workspace.status).toBe("active");

    const archived = await json<{ workspace: { status: string; name: string } }>(
      await workspaceAction(
        post(`${BASE}/workspaces`, { action: "update", id, status: "archived" })
      )
    );
    expect(archived.workspace.status).toBe("archived");
    // Archiving is a status change, not a delete.
    expect(archived.workspace.name).toBe("Consumer cybersecurity");

    const list = await json<{ workspaces: { id: number; status: string }[] }>(
      await listWorkspaces()
    );
    expect(list.workspaces).toHaveLength(2);
    expect(list.workspaces.find((w) => w.id === other)?.status).toBe("planned");
  });

  it("rejects duplicate names and unknown ids", async () => {
    await createWorkspace("Duplicate");

    const duplicate = await workspaceAction(
      post(`${BASE}/workspaces`, { action: "create", name: "Duplicate" })
    );
    expect(duplicate.status).toBe(409);

    const unknown = await workspaceAction(
      post(`${BASE}/workspaces`, { action: "update", id: 999999, status: "paused" })
    );
    expect(unknown.status).toBe(404);

    const badStatus = await workspaceAction(
      post(`${BASE}/workspaces`, { action: "create", name: "Bad", status: "deleted" })
    );
    expect(badStatus.status).toBe(400);
  });
});
