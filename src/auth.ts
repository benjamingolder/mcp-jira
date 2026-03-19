const JIRA_URL = process.env.JIRA_URL!;
const JIRA_EMAIL = process.env.JIRA_EMAIL!;
const JIRA_TOKEN = process.env.JIRA_TOKEN!;

if (!JIRA_URL || !JIRA_EMAIL || !JIRA_TOKEN) {
  throw new Error("JIRA_URL, JIRA_EMAIL und JIRA_TOKEN müssen gesetzt sein.");
}

export const baseUrl = JIRA_URL.replace(/\/$/, "");

export const authHeaders: Record<string, string> = {
  Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};

export async function jiraFetch(path: string): Promise<unknown> {
  const res = await fetch(`${baseUrl}/rest/api/3${path}`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API Fehler ${res.status}: ${text}`);
  }

  return res.json();
}
