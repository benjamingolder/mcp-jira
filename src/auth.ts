export interface JiraCredentials {
  baseUrl: string;
  email: string;
  token: string;
}

function makeAuthHeaders(creds: JiraCredentials): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function jiraFetch(path: string, creds: JiraCredentials): Promise<unknown> {
  const res = await fetch(`${creds.baseUrl}/rest/api/3${path}`, {
    headers: makeAuthHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API Fehler ${res.status}: ${text}`);
  }
  return res.json();
}

export async function jiraAgileFetch(path: string, creds: JiraCredentials): Promise<unknown> {
  const res = await fetch(`${creds.baseUrl}/rest/agile/1.0${path}`, {
    headers: makeAuthHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira Agile API Fehler ${res.status}: ${text}`);
  }
  return res.json();
}
