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
import { searchIssues, getIssue, getIssueComments, getIssueChangelog } from "./tools/issues.js";
import { listProjects, getProject, getProjectVersions, getProjectComponents } from "./tools/projects.js";
import { listBoards, getBoard, listSprints, getSprint, getSprintIssues, getBoardBacklog } from "./tools/boards.js";

const API_KEY = process.env.API_KEY;
const PORT = parseInt(process.env.PORT ?? "3003");

function createMcpServer(): Server {
  const server = new Server(
    {
      name: "jira-mcp",
      version: "1.0.0",
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
    const { name, arguments: args } = req.params;
    try {
      let result: unknown;
      switch (name) {
        case "search_issues":        result = await searchIssues(args as any); break;
        case "get_issue":            result = await getIssue(args as any); break;
        case "get_issue_comments":   result = await getIssueComments(args as any); break;
        case "get_issue_changelog":  result = await getIssueChangelog(args as any); break;
        case "list_projects":        result = await listProjects(args as any); break;
        case "get_project":          result = await getProject(args as any); break;
        case "get_project_versions": result = await getProjectVersions(args as any); break;
        case "get_project_components": result = await getProjectComponents(args as any); break;
        case "list_boards":          result = await listBoards(args as any); break;
        case "get_board":            result = await getBoard(args as any); break;
        case "list_sprints":         result = await listSprints(args as any); break;
        case "get_sprint":           result = await getSprint(args as any); break;
        case "get_sprint_issues":    result = await getSprintIssues(args as any); break;
        case "get_board_backlog":    result = await getBoardBacklog(args as any); break;
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

const app = express();
app.use(cors());
app.use(express.json());

// API-Key Middleware
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (API_KEY) {
    const provided = req.headers["x-api-key"] ?? req.query["apikey"];
    if (provided !== API_KEY) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Streamable HTTP Transport
app.all("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// SSE Transport (Legacy)
const sseTransports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  sseTransports[transport.sessionId] = transport;
  const server = createMcpServer();
  await server.connect(transport);
  res.on("close", () => delete sseTransports[transport.sessionId]);
});

app.post("/messages", async (req, res) => {
  const id = req.query.sessionId as string;
  const transport = sseTransports[id];
  if (!transport) { res.status(404).send("Session nicht gefunden"); return; }
  await transport.handlePostMessage(req, res);
});

app.listen(PORT, () => console.log(`mcp-jira läuft auf Port ${PORT}`));
