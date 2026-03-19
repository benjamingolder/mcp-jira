import { jiraFetch } from "../auth.js";

export async function listProjects(args: { maxResults?: number }) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 50) });
  return jiraFetch(`/project/search?${params}`);
}

export async function getProject(args: { projectKey: string }) {
  return jiraFetch(`/project/${args.projectKey}`);
}

export async function getProjectVersions(args: { projectKey: string }) {
  return jiraFetch(`/project/${args.projectKey}/versions`);
}

export async function getProjectComponents(args: { projectKey: string }) {
  return jiraFetch(`/project/${args.projectKey}/components`);
}
