import "dotenv/config";
import express from "express";
import cors from "cors";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { entraAuthMiddleware } from "./entraAuth.js";
import type { EntraUser } from "./entraAuth.js";
import { getCredentials, ensureTable } from "./storage.js";
import { handleSetupGet, handleSetupPost, getSetupUrl } from "./setup.js";
import { searchIssues, getIssue, getIssueComments, getIssueChangelog } from "./tools/issues.js";
import { listProjects, getProject, getProjectVersions, getProjectComponents } from "./tools/projects.js";
import { listBoards, getBoard, listSprints, getSprint, getSprintIssues, getBoardBacklog } from "./tools/boards.js";
import type { JiraCredentials } from "./auth.js";

const PORT = parseInt(process.env.PORT ?? "3003");

const NOT_CONFIGURED_MSG = (setupUrl: string) =>
  `Dein Jira-Account ist noch nicht mit dem Copilot-Agenten verbunden.\n\n` +
  `Bitte öffne diesen Link um deinen Account einzurichten (Link ist 1 Stunde gültig):\n${setupUrl}`;

function createMcpServer(creds: JiraCredentials | null, user: EntraUser): Server {
  const server = new Server(
    {
      name: "jira-mcp",
      version: "2.0.0",
      title: "Jira",
      description: "MCP Server für Jira (read-only: Issues, Projekte, Boards, Sprints)",
    },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      // ── Issues ────────────────────────────────────────────────────
      {
        name: "search_issues",
        description: "Sucht Jira Issues per JQL",
        inputSchema: {
          type: "object",
          properties: {
            jql: { type: "string", description: "JQL-Abfrage (z.B. 'project = ABC AND status = Open')" },
            maxResults: { type: "number", description: "Max. Anzahl Ergebnisse (Standard: 20)" },
            fields: { type: "array", items: { type: "string" }, description: "Felder die zurückgegeben werden sollen" },
          },
          required: ["jql"],
        },
      },
      {
        name: "get_issue",
        description: "Liest Details eines Jira Issues",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string", description: "Issue-Key (z.B. ABC-123)" },
          },
          required: ["issueKey"],
        },
      },
      {
        name: "get_issue_comments",
        description: "Liest die Kommentare eines Issues",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string", description: "Issue-Key (z.B. ABC-123)" },
            maxResults: { type: "number", description: "Max. Anzahl Kommentare (Standard: 20)" },
          },
          required: ["issueKey"],
        },
      },
      {
        name: "get_issue_changelog",
        description: "Liest den Änderungsverlauf eines Issues",
        inputSchema: {
          type: "object",
          properties: {
            issueKey: { type: "string", description: "Issue-Key (z.B. ABC-123)" },
          },
          required: ["issueKey"],
        },
      },
      // ── Projekte ──────────────────────────────────────────────────
      {
        name: "list_projects",
        description: "Listet alle Jira Projekte auf",
        inputSchema: {
          type: "object",
          properties: {
            maxResults: { type: "number", description: "Max. Anzahl Projekte (Standard: 50)" },
          },
        },
      },
      {
        name: "get_project",
        description: "Liest Details eines Jira Projekts",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string", description: "Projekt-Key (z.B. ABC)" },
          },
          required: ["projectKey"],
        },
      },
      {
        name: "get_project_versions",
        description: "Listet Versionen/Releases eines Projekts auf",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string", description: "Projekt-Key" },
          },
          required: ["projectKey"],
        },
      },
      {
        name: "get_project_components",
        description: "Listet Komponenten eines Projekts auf",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string", description: "Projekt-Key" },
          },
          required: ["projectKey"],
        },
      },
      // ── Boards & Sprints ──────────────────────────────────────────
      {
        name: "list_boards",
        description: "Listet Jira Boards auf",
        inputSchema: {
          type: "object",
          properties: {
            projectKey: { type: "string", description: "Projekt-Key zum Filtern (optional)" },
            maxResults: { type: "number", description: "Max. Anzahl Boards (Standard: 20)" },
          },
        },
      },
      {
        name: "get_board",
        description: "Liest Details eines Boards",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "number", description: "Board-ID" },
          },
          required: ["boardId"],
        },
      },
      {
        name: "list_sprints",
        description: "Listet Sprints eines Boards auf",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "number", description: "Board-ID" },
            state: { type: "string", enum: ["active", "closed", "future"], description: "Sprint-Status filtern" },
          },
          required: ["boardId"],
        },
      },
      {
        name: "get_sprint",
        description: "Liest Details eines Sprints",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "number", description: "Sprint-ID" },
          },
          required: ["sprintId"],
        },
      },
      {
        name: "get_sprint_issues",
        description: "Listet Issues eines Sprints auf",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "number", description: "Sprint-ID" },
            maxResults: { type: "number", description: "Max. Anzahl Issues (Standard: 50)" },
          },
          required: ["sprintId"],
        },
      },
      {
        name: "get_board_backlog",
        description: "Listet Issues im Backlog eines Boards auf",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "number", description: "Board-ID" },
            maxResults: { type: "number", description: "Max. Anzahl Issues (Standard: 50)" },
          },
          required: ["boardId"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    // Kein Jira-Account verknüpft → Setup-URL zurückgeben
    if (!creds) {
      const setupUrl = getSetupUrl(user.oid);
      return { content: [{ type: "text", text: NOT_CONFIGURED_MSG(setupUrl) }] };
    }

    const { name, arguments: args } = req.params;
    try {
      let result: unknown;
      switch (name) {
        case "search_issues":          result = await searchIssues(args as any, creds); break;
        case "get_issue":              result = await getIssue(args as any, creds); break;
        case "get_issue_comments":     result = await getIssueComments(args as any, creds); break;
        case "get_issue_changelog":    result = await getIssueChangelog(args as any, creds); break;
        case "list_projects":          result = await listProjects(args as any, creds); break;
        case "get_project":            result = await getProject(args as any, creds); break;
        case "get_project_versions":   result = await getProjectVersions(args as any, creds); break;
        case "get_project_components": result = await getProjectComponents(args as any, creds); break;
        case "list_boards":            result = await listBoards(args as any, creds); break;
        case "get_board":              result = await getBoard(args as any, creds); break;
        case "list_sprints":           result = await listSprints(args as any, creds); break;
        case "get_sprint":             result = await getSprint(args as any, creds); break;
        case "get_sprint_issues":      result = await getSprintIssues(args as any, creds); break;
        case "get_board_backlog":      result = await getBoardBacklog(args as any, creds); break;
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unbekanntes Tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, msg);
    }
  });

  return server;
}

// ── Express Setup ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── OAuth 2.0 Dynamic Client Registration (DCR) ────────────────────────────────
// Required by Copilot Studio "Dynamic Discovery Authentication"

const tenantId = process.env.ENTRA_TENANT_ID!;
const clientId = process.env.ENTRA_CLIENT_ID!;         // dev-jira-mcp-sp (Ressource/API)
const copilotClientId = process.env.COPILOT_CLIENT_ID!; // dev-jira-mcp-copilot-sp (OAuth-Client)
const appUrl = process.env.APP_URL!;
const scope = `api://${clientId}/access`;

const authServerMetadata = {
  issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
  authorization_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
  token_endpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
  registration_endpoint: `${appUrl}/register`,
  scopes_supported: [scope, "openid", "profile", "offline_access"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
};

const protectedResourceMetadata = {
  resource: appUrl,
  authorization_servers: [`https://login.microsoftonline.com/${tenantId}/v2.0`],
  scopes_supported: [scope],
  bearer_methods_supported: ["header"],
};

// Discovery endpoints – must be reachable without Bearer token (before auth middleware)
// Copilot Studio appends the MCP path suffix, so we handle both variants.
app.get(["/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/*"],
  (_req, res) => res.json(authServerMetadata));

app.get(["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/*"],
  (_req, res) => res.json(protectedResourceMetadata));

app.post("/register", (_req, res) => {
  res.status(201).json({
    client_id: copilotClientId,
    client_name: "mcp-jira-client",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope,
    token_endpoint_auth_method: "none",
  });
});

// ── Setup-Seite (kein Auth nötig, gesichert via HMAC-Token) ───────────────────
app.get("/setup", handleSetupGet);
app.post("/setup", handleSetupPost);

// Alle MCP-Endpunkte erfordern Entra ID Auth
app.use(entraAuthMiddleware);

// Streamable HTTP Transport
app.all("/mcp", async (req, res) => {
  const user = req.user!;
  const creds = await getCredentials(user.oid);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer(creds, user);
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// SSE Transport (Legacy)
interface SseSession {
  transport: SSEServerTransport;
  creds: JiraCredentials | null;
  user: EntraUser;
}
const sseSessions: Record<string, SseSession> = {};

app.get("/sse", async (req, res) => {
  const user = req.user!;
  const creds = await getCredentials(user.oid);
  const transport = new SSEServerTransport("/messages", res);
  sseSessions[transport.sessionId] = { transport, creds, user };
  const server = createMcpServer(creds, user);
  await server.connect(transport);
  res.on("close", () => delete sseSessions[transport.sessionId]);
});

app.post("/messages", async (req, res) => {
  const id = req.query.sessionId as string;
  const session = sseSessions[id];
  if (!session) { res.status(404).send("Session nicht gefunden"); return; }
  await session.transport.handlePostMessage(req, res);
});

// ── Start ──────────────────────────────────────────────────────────────────────

await ensureTable();
app.listen(PORT, () => console.log(`mcp-jira v2 läuft auf Port ${PORT}`));
