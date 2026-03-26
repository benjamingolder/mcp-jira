import { jiraFetch } from "../auth.js";
import type { JiraCredentials, JiraOAuthCredentials } from "../auth.js";
type AnyJiraCreds = JiraCredentials | JiraOAuthCredentials;

export async function listProjects(args: { maxResults?: number }, creds: AnyJiraCreds) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return jiraFetch(`/project/search?${params}`, creds);
}

export async function getProject(args: { projectKey: string }, creds: AnyJiraCreds) {
  return jiraFetch(`/project/${args.projectKey}`, creds);
}

export async function getProjectVersions(args: { projectKey: string }, creds: AnyJiraCreds) {
  return jiraFetch(`/project/${args.projectKey}/versions`, creds);
}

export async function getProjectComponents(args: { projectKey: string }, creds: AnyJiraCreds) {
  return jiraFetch(`/project/${args.projectKey}/components`, creds);
}
