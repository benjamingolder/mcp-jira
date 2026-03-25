import { jiraFetch } from "../auth.js";
import type { JiraCredentials } from "../auth.js";

export async function searchIssues(
  args: { jql: string; maxResults?: number; fields?: string[] },
  creds: JiraCredentials
) {
  const params = new URLSearchParams({
    jql: args.jql,
    maxResults: String(args.maxResults ?? 20),
    fields: (args.fields ?? ["summary", "status", "assignee", "priority", "issuetype", "created", "updated", "description"]).join(","),
  });
  return jiraFetch(`/search/jql?${params}`, creds);
}

export async function getIssue(args: { issueKey: string }, creds: JiraCredentials) {
  return jiraFetch(`/issue/${args.issueKey}`, creds);
}

export async function getIssueComments(
  args: { issueKey: string; maxResults?: number },
  creds: JiraCredentials
) {
  const params = new URLSearchParams({ maxResults: String(args.maxResults ?? 20) });
  return jiraFetch(`/issue/${args.issueKey}/comment?${params}`, creds);
}

export async function getIssueChangelog(args: { issueKey: string }, creds: JiraCredentials) {
  return jiraFetch(`/issue/${args.issueKey}/changelog`, creds);
}
