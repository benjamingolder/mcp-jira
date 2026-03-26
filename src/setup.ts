import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { saveOAuthCredentials } from "./storage.js";
import type { JiraOAuthCredentials } from "./auth.js";

const SETUP_SECRET = process.env.SETUP_SECRET!;
const APP_URL = process.env.APP_URL!;
const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID!;
const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET!;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 Stunde

const CALLBACK_URL = `${APP_URL}/setup/callback`;
const SCOPES = "read:jira-work read:jira-user offline_access";

export function generateSetupToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac("sha256", SETUP_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

function verifySetupToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const dotIndex = decoded.lastIndexOf(".");
    const sigPart = decoded.slice(dotIndex + 1);
    const body = decoded.slice(0, dotIndex);
    const bodyDotIndex = body.lastIndexOf(".");
    const userId = body.slice(0, bodyDotIndex);
    const timestamp = parseInt(body.slice(bodyDotIndex + 1));

    if (Date.now() - timestamp > TOKEN_TTL_MS) return null;

    const expected = createHmac("sha256", SETUP_SECRET).update(body).digest("hex");
    if (!timingSafeEqual(Buffer.from(sigPart, "hex"), Buffer.from(expected, "hex"))) return null;

    return userId;
  } catch {
    return null;
  }
}

export function getSetupUrl(userId: string): string {
  return `${APP_URL}/setup?token=${generateSetupToken(userId)}`;
}

export async function handleSetupGet(req: Request, res: Response): Promise<void> {
  const token = req.query.token as string;
  const userId = token ? verifySetupToken(token) : null;

  if (!userId) {
    res.status(400).send(errorPage("Ungültiger oder abgelaufener Link. Bitte frage via Copilot einen neuen Setup-Link an."));
    return;
  }

  // Encode userId in state (HMAC-signed)
  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");
  const sig = createHmac("sha256", SETUP_SECRET).update(state).digest("hex");
  const signedState = `${state}.${sig}`;

  const authUrl = new URL("https://auth.atlassian.com/authorize");
  authUrl.searchParams.set("audience", "api.atlassian.com");
  authUrl.searchParams.set("client_id", ATLASSIAN_CLIENT_ID);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("redirect_uri", CALLBACK_URL);
  authUrl.searchParams.set("state", signedState);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "consent");

  res.redirect(authUrl.toString());
}

export async function handleSetupCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.status(400).send(errorPage(`Atlassian Login fehlgeschlagen: ${error}`));
    return;
  }

  if (!code || !state) {
    res.status(400).send(errorPage("Ungültige Callback-Parameter."));
    return;
  }

  // Verify state signature
  const dotIdx = state.lastIndexOf(".");
  const stateBody = state.slice(0, dotIdx);
  const stateSig = state.slice(dotIdx + 1);
  const expectedSig = createHmac("sha256", SETUP_SECRET).update(stateBody).digest("hex");
  if (stateSig !== expectedSig) {
    res.status(400).send(errorPage("Ungültiger State-Parameter."));
    return;
  }

  let userId: string;
  try {
    const parsed = JSON.parse(Buffer.from(stateBody, "base64url").toString("utf8"));
    userId = parsed.userId;
    if (Date.now() - parsed.ts > TOKEN_TTL_MS) throw new Error("expired");
  } catch {
    res.status(400).send(errorPage("Abgelaufener oder ungültiger State."));
    return;
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ATLASSIAN_CLIENT_ID,
      client_secret: ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: CALLBACK_URL,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error(`[Setup] Token-Exchange fehlgeschlagen: ${err}`);
    res.status(500).send(errorPage("Token-Exchange fehlgeschlagen. Bitte versuche es erneut."));
    return;
  }

  const tokenData = await tokenRes.json() as any;

  // Get accessible Jira cloud instances
  const resourceRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
  });

  if (!resourceRes.ok) {
    res.status(500).send(errorPage("Jira-Instanz konnte nicht abgerufen werden."));
    return;
  }

  const resources = await resourceRes.json() as any[];
  if (!resources.length) {
    res.status(400).send(errorPage("Kein Jira-Zugang gefunden. Stelle sicher dass du Zugriff auf mindestens eine Jira-Instanz hast."));
    return;
  }

  // Use first available Jira cloud instance
  const cloudId = resources[0].id;

  const creds: JiraOAuthCredentials = {
    cloudId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? "",
    expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };

  await saveOAuthCredentials(userId, creds);
  console.log(`[Setup] OAuth erfolgreich für userId: ${userId}, cloudId: ${cloudId}`);

  res.send(successPage());
}

function successPage(): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Jira MCP – Verbunden</title>
  <style>
    body { font-family: "Segoe UI", -apple-system, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; padding: 2.5rem; text-align: center; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,.08); }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h1 { font-size: 1.2rem; color: #111827; margin-bottom: 0.5rem; }
    p { color: #6b7280; font-size: 0.875rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Jira erfolgreich verbunden!</h1>
    <p>Dein Jira-Account ist jetzt mit dem Copilot-Agenten verbunden.<br>Du kannst dieses Fenster schliessen.</p>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Jira MCP – Fehler</title>
  <style>
    body { font-family: "Segoe UI", -apple-system, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 12px; padding: 2.5rem; text-align: center; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,.08); }
    .icon { font-size: 2.5rem; margin-bottom: 1rem; }
    h1 { font-size: 1.2rem; color: #111827; margin-bottom: 0.5rem; }
    p { color: #6b7280; font-size: 0.875rem; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Fehler</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
