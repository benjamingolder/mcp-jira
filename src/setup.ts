import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { saveCredentials } from "./storage.js";

const SETUP_SECRET = process.env.SETUP_SECRET!;
const APP_URL = process.env.APP_URL!;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 Stunde

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

  res.send(formPage(token));
}

export async function handleSetupPost(req: Request, res: Response): Promise<void> {
  const { token, baseUrl, email, apiToken } = req.body as Record<string, string>;
  const userId = token ? verifySetupToken(token) : null;

  if (!userId) {
    res.status(400).send(errorPage("Ungültiger oder abgelaufener Link."));
    return;
  }

  if (!baseUrl || !email || !apiToken) {
    res.status(400).send(errorPage("Alle Felder sind erforderlich."));
    return;
  }

  const cleanUrl = baseUrl.replace(/\/$/, "");
  const testRes = await fetch(`${cleanUrl}/rest/api/3/myself`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
      Accept: "application/json",
    },
  });

  if (!testRes.ok) {
    res.status(400).send(errorPage("Jira-Zugangsdaten ungültig. Bitte prüfe URL, E-Mail und API-Token."));
    return;
  }

  await saveCredentials(userId, { baseUrl: cleanUrl, email, token: apiToken });
  res.send(successPage());
}

function formPage(token: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jira MCP – Einrichtung</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Segoe UI", -apple-system, sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; }
    .card { background: #fff; border-radius: 12px; padding: 2rem; width: 100%; max-width: 460px; box-shadow: 0 4px 12px rgba(0,0,0,.08); }
    .logo { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.5rem; }
    .logo-icon { width: 32px; height: 32px; background: #0052cc; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1rem; }
    h1 { font-size: 1.25rem; color: #111827; margin-bottom: 0.4rem; }
    .subtitle { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.75rem; line-height: 1.5; }
    label { display: block; font-size: 0.8rem; font-weight: 600; color: #374151; margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: .03em; }
    input { width: 100%; padding: 0.6rem 0.75rem; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 0.9rem; margin-bottom: 1.1rem; outline: none; transition: border-color .15s, box-shadow .15s; color: #111; }
    input:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
    .hint { font-size: 0.75rem; color: #9ca3af; margin-top: -0.8rem; margin-bottom: 1.1rem; }
    .hint a { color: #6366f1; text-decoration: none; }
    button { width: 100%; padding: 0.7rem; background: #6366f1; color: white; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: background .15s; }
    button:hover { background: #4f46e5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">J</div>
      <span style="font-weight:600;color:#111">Jira MCP</span>
    </div>
    <h1>Jira-Account verbinden</h1>
    <p class="subtitle">Verbinde deinen persönlichen Jira-Account mit dem Copilot-Agenten. Deine Zugangsdaten werden verschlüsselt gespeichert.</p>
    <form method="POST" action="/setup">
      <input type="hidden" name="token" value="${token}">
      <label>Jira URL</label>
      <input type="url" name="baseUrl" placeholder="https://deine-firma.atlassian.net" required>
      <label>E-Mail</label>
      <input type="email" name="email" placeholder="name@firma.ch" required>
      <label>API-Token</label>
      <input type="password" name="apiToken" required>
      <p class="hint">Token erstellen: <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">id.atlassian.com → Sicherheit → API-Tokens</a></p>
      <button type="submit">Verbindung speichern</button>
    </form>
  </div>
</body>
</html>`;
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
    <h1>Verbindung hergestellt!</h1>
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
