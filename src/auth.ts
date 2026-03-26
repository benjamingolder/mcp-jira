export interface JiraCredentials {
  baseUrl: string;
  email: string;
  token: string;
}

export interface JiraOAuthCredentials {
  cloudId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
}

function makeBasicHeaders(creds: JiraCredentials): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function makeOAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function getBaseUrl(creds: JiraCredentials | JiraOAuthCredentials): string {
  if ("cloudId" in creds) {
    return `https://api.atlassian.com/ex/jira/${creds.cloudId}`;
  }
  return creds.baseUrl;
}

function getHeaders(creds: JiraCredentials | JiraOAuthCredentials): Record<string, string> {
  if ("cloudId" in creds) {
    return makeOAuthHeaders(creds.accessToken);
  }
  return makeBasicHeaders(creds);
}

export async function refreshAtlassianToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}> {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token-Refresh fehlgeschlagen: ${await res.text()}`);
  const data = await res.json() as any;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
}

export async function jiraFetch(
  path: string,
  creds: JiraCredentials | JiraOAuthCredentials
): Promise<unknown> {
  const res = await fetch(`${getBaseUrl(creds)}/rest/api/3${path}`, {
    headers: getHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API Fehler ${res.status}: ${text}`);
  }
  return res.json();
}

export async function jiraAgileFetch(
  path: string,
  creds: JiraCredentials | JiraOAuthCredentials
): Promise<unknown> {
  const res = await fetch(`${getBaseUrl(creds)}/rest/agile/1.0${path}`, {
    headers: getHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira Agile API Fehler ${res.status}: ${text}`);
  }
  return res.json();
}
