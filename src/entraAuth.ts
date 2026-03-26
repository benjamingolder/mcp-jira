import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request, Response, NextFunction } from "express";

export interface EntraUser {
  oid: string;
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: EntraUser;
    }
  }
}

const tenantId = process.env.ENTRA_TENANT_ID!;
const clientId = process.env.ENTRA_CLIENT_ID!;

const JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
);

export async function entraAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  console.log(`[Auth] ${req.method} ${req.path} | Authorization: ${req.headers.authorization ? "present" : "missing"}`);

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    console.log(`[Auth] Rejected: no Bearer token`);
    const appUrl = process.env.APP_URL ?? "";
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`)
      .json({ error: "Authorization Header fehlt" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: `api://${clientId}`,
      issuer: [
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
        `https://sts.windows.net/${tenantId}/`,
      ],
    });

    req.user = {
      oid: payload.oid as string,
      name: (payload.name ?? payload.preferred_username ?? "Unbekannt") as string,
      email: (payload.upn ?? payload.preferred_username ?? "") as string,
    };
    console.log(`[Auth] OK | oid: ${req.user.oid} | email: ${req.user.email}`);
    next();
  } catch (err) {
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        console.log(`[Auth] Token aud: ${decoded.aud} | iss: ${decoded.iss}`);
      }
    } catch {}
    console.log(`[Auth] Token invalid: ${err instanceof Error ? err.message : String(err)}`);
    res.status(401).json({ error: "Ungültiger oder abgelaufener Token" });
  }
}
