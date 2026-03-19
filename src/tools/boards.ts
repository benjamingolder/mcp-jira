import { baseUrl, authHeaders } from "../auth.js";

async function agileFetch(path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/rest/agile/1.0${path}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira Agile API Fehler ${res.status}: ${text}`);
  }

  return res.json();
}

export async function listBoards(args: { projectKey?: string; maxResults?: number }) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 20) });
  if (args.projectKey) params.set("projectKeyOrId", args.projectKey);
  return agileFetch(`/board?${params}`);
}

export async function getBoard(args: { boardId: number }) {
  return agileFetch(`/board/${args.boardId}`);
}

export async function listSprints(args: { boardId: number; state?: string }) {
  const params = new URLSearchParams();
  if (args.state) params.set("state", args.state);
  return agileFetch(`/board/${args.boardId}/sprint?${params}`);
}

export async function getSprint(args: { sprintId: number }) {
  return agileFetch(`/sprint/${args.sprintId}`);
}

export async function getSprintIssues(args: { sprintId: number; maxResults?: number }) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return agileFetch(`/sprint/${args.sprintId}/issue?${params}`);
}

export async function getBoardBacklog(args: { boardId: number; maxResults?: number }) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return agileFetch(`/board/${args.boardId}/backlog?${params}`);
}
