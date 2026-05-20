#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { IdeClient } from "./ideClient.js";
import { applyUnifiedPatch } from "./utils/patch.js";

const config = loadConfig();
const client = new IdeClient(config);

const projectIdSchema = z.object({
  projectId: z.string().optional().describe("SoroPG workspace/project id. Defaults to SOROPG_PROJECT_ID when set."),
});

function resolveProjectId(projectId?: string): string {
  const resolved = projectId || config.projectId;
  if (!resolved) {
    throw new Error("projectId is required. Run soropg_list_projects first or set SOROPG_PROJECT_ID.");
  }
  return resolved;
}

function textResponse(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function runTool<T>(fn: () => Promise<T>) {
  try {
    return textResponse(await fn());
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: (error as Error).message,
        },
      ],
    };
  }
}

const server = new McpServer({
  name: "soropg-mcp",
  version: "0.1.0",
});

server.tool(
  "soropg_list_projects",
  "List remote SoroPG workspaces currently exposed by the open browser IDE tab.",
  {},
  async () => runTool(() => client.listProjects()),
);

server.tool(
  "soropg_get_project",
  "Get metadata and files for a SoroPG project.",
  projectIdSchema.shape,
  async ({ projectId }) => runTool(() => client.getProject(resolveProjectId(projectId))),
);

server.tool(
  "soropg_list_files",
  "List files in a SoroPG project.",
  projectIdSchema.shape,
  async ({ projectId }) => runTool(() => client.listFiles(resolveProjectId(projectId))),
);

server.tool(
  "soropg_read_file",
  "Read one file from a SoroPG project.",
  {
    ...projectIdSchema.shape,
    path: z.string().describe("Relative file path, such as src/lib.rs."),
  },
  async ({ projectId, path }) => runTool(() => client.readFile(resolveProjectId(projectId), path)),
);

server.tool(
  "soropg_create_file",
  "Create a new file in a SoroPG project.",
  {
    ...projectIdSchema.shape,
    path: z.string(),
    content: z.string(),
  },
  async ({ projectId, path, content }) => runTool(() => client.createFile(resolveProjectId(projectId), path, content)),
);

server.tool(
  "soropg_replace_file",
  "Replace the full contents of an existing SoroPG project file.",
  {
    ...projectIdSchema.shape,
    path: z.string(),
    content: z.string(),
  },
  async ({ projectId, path, content }) => runTool(() => client.replaceFile(resolveProjectId(projectId), path, content)),
);

server.tool(
  "soropg_apply_patch",
  "Apply a unified diff patch to one SoroPG project file.",
  {
    ...projectIdSchema.shape,
    path: z.string(),
    patch: z.string().describe("Unified diff hunk(s) for the target file."),
  },
  async ({ projectId, path, patch }) => runTool(async () => {
    const resolvedProjectId = resolveProjectId(projectId);
    const current = await client.readFile(resolvedProjectId, path);
    const nextContent = applyUnifiedPatch(current.content, patch);
    return client.replaceFile(resolvedProjectId, path, nextContent);
  }),
);

server.tool(
  "soropg_delete_file",
  "Delete a file from a SoroPG project.",
  {
    ...projectIdSchema.shape,
    path: z.string(),
  },
  async ({ projectId, path }) => runTool(() => client.deleteFile(resolveProjectId(projectId), path)),
);

server.tool(
  "soropg_move_file",
  "Move or rename a file in a SoroPG project.",
  {
    ...projectIdSchema.shape,
    fromPath: z.string(),
    toPath: z.string(),
  },
  async ({ projectId, fromPath, toPath }) => runTool(() => client.moveFile(resolveProjectId(projectId), fromPath, toPath)),
);

server.tool(
  "soropg_run_command",
  "Run a whitelisted SoroPG backend command. Allowed commands: build, test, audit. Deploy returns unsupported in v1.",
  {
    ...projectIdSchema.shape,
    command: z.enum(["build", "test", "audit", "deploy"]),
  },
  async ({ projectId, command }) => runTool(() => client.runCommand(resolveProjectId(projectId), command)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
