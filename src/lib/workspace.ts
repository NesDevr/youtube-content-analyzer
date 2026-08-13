import { prisma } from "./prisma";

/**
 * A channel workspace is one channel the user is planning or running. Every
 * user-owned research artifact (folder, saved search, generated ideas, niche
 * discovery) belongs to exactly one workspace. Public YouTube evidence
 * (`Video`, `Channel`) is global and shared by all workspaces.
 */

export const WORKSPACE_STATUSES = [
  "planned",
  "active",
  "paused",
  "archived",
] as const;

export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const WORKSPACE_CONTENT_FORMATS = [
  "long-form",
  "short-form",
  "both",
] as const;

/**
 * Resolves the workspace a request is scoped to. There is deliberately no
 * fallback to "the first workspace" — a caller that forgets to send the
 * workspace must fail loudly rather than silently write into someone else's
 * research.
 */
export async function resolveWorkspaceId(
  raw: string | number | null | undefined
): Promise<{ ok: true; workspaceId: number } | { ok: false; error: string; status: number }> {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: false, error: "workspaceId is required", status: 400 };
  }

  const workspaceId = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    return { ok: false, error: `Invalid workspaceId: ${raw}`, status: 400 };
  }

  const workspace = await prisma.channelWorkspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    return { ok: false, error: `Workspace ${workspaceId} not found`, status: 404 };
  }

  return { ok: true, workspaceId };
}
