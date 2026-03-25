import { jiraFetch } from "../auth.js";
import type { JiraCredentials } from "../auth.js";

export async function listProjects(args: { maxResults?: number }, creds: JiraCredentials) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return jiraFetch(`/project/search?${params}`, creds);
}

export async function getProject(args: { projectKey: string }, creds: JiraCredentials) {
  return jiraFetch(`/project/${args.projectKey}`, creds);
}

export async function getProjectVersions(args: { projectKey: string }, creds: JiraCredentials) {
  return jiraFetch(`/project/${args.projectKey}/versions`, creds);
}

export async function getProjectComponents(args: { projectKey: string }, creds: JiraCredentials) {
  return jiraFetch(`/project/${args.projectKey}/components`, creds);
}
