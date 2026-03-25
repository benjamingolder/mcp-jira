import { jiraAgileFetch } from "../auth.js";
import type { JiraCredentials } from "../auth.js";

export async function listBoards(
  args: { projectKey?: string; maxResults?: number },
  creds: JiraCredentials
) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 20) });
  if (args.projectKey) params.set("projectKeyOrId", args.projectKey);
  return jiraAgileFetch(`/board?${params}`, creds);
}

export async function getBoard(args: { boardId: number }, creds: JiraCredentials) {
  return jiraAgileFetch(`/board/${args.boardId}`, creds);
}

export async function listSprints(
  args: { boardId: number; state?: string },
  creds: JiraCredentials
) {
  const params = new URLSearchParams();
  if (args.state) params.set("state", args.state);
  return jiraAgileFetch(`/board/${args.boardId}/sprint?${params}`, creds);
}

export async function getSprint(args: { sprintId: number }, creds: JiraCredentials) {
  return jiraAgileFetch(`/sprint/${args.sprintId}`, creds);
}

export async function getSprintIssues(
  args: { sprintId: number; maxResults?: number },
  creds: JiraCredentials
) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return jiraAgileFetch(`/sprint/${args.sprintId}/issue?${params}`, creds);
}

export async function getBoardBacklog(
  args: { boardId: number; maxResults?: number },
  creds: JiraCredentials
) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return jiraAgileFetch(`/board/${args.boardId}/backlog?${params}`, creds);
}
