import { jiraFetch } from "../auth.js";

export async function searchIssues(args: {
  jql: string;
  maxResults?: number;
  fields?: string[];
}) {
  const params = new URLSearchParams({
    jql: args.jql,
    maxResults: String(args.maxResults ?? 20),
    fields: (args.fields ?? ["summary", "status", "assignee", "priority", "issuetype", "created", "updated", "description"]).join(","),
  });
  return jiraFetch(`/search?${params}`);
}

export async function getIssue(args: { issueKey: string }) {
  return jiraFetch(`/issue/${args.issueKey}`);
}

export async function getIssueComments(args: { issueKey: string; maxResults?: number }) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 20) });
  return jiraFetch(`/issue/${args.issueKey}/comment?${params}`);
}

export async function getIssueChangelog(args: { issueKey: string }) {
  return jiraFetch(`/issue/${args.issueKey}/changelog`);
}
