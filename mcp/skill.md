# SoroPG MCP Skill

Use this skill when a user wants an AI coding agent to connect to SoroPG, inspect a browser workspace, edit Soroban contract files, or run SoroPG build, test, or audit commands through MCP.

## What This Server Does

The SoroPG MCP server is a local stdio bridge between an MCP-compatible coding agent and the user's open SoroPG browser tab.

```text
AI coding agent -> local MCP server over stdio -> SoroPG API -> open browser IDE workspace
```

It does not clone, mirror, or write a local project directory. The source of truth is the user's SoroPG browser workspace.

Source repository:
- https://github.com/jamesbachini/Soroban-Playground

MCP package directory:
- https://github.com/jamesbachini/Soroban-Playground/tree/main/mcp

Runtime requirement:
- Node.js 20 or newer.

## Install The Server

If the repository is not already available locally:

```bash
git clone https://github.com/jamesbachini/Soroban-Playground.git
cd Soroban-Playground/mcp
npm install
npm run build
```

If the repository already exists locally:

```bash
cd /absolute/path/to/Soroban-Playground/mcp
npm install
npm run build
```

The built MCP server entrypoint is:

```text
/absolute/path/to/Soroban-Playground/mcp/dist/index.js
```

## Get The Browser API Key

Ask the user to:
1. Open SoroPG in a browser.
2. Open the AI tab in the left sidebar.
3. Click Generate to create a User API Key.
4. Keep the SoroPG browser tab open while the agent works.

Use:

```bash
SOROPG_API_URL=https://soropg.com
SOROPG_API_KEY=the-key-from-the-soropg-ai-tab
```

For local development, `SOROPG_API_URL` can be the user's local SoroPG origin, for example:

```bash
SOROPG_API_URL=http://localhost:8080
```

Optional:

```bash
SOROPG_PROJECT_ID=workspace-id
```

Set `SOROPG_PROJECT_ID` only after calling `soropg_list_projects` and choosing a workspace.

## Configure MCP Clients

Generic MCP JSON:

```json
{
  "mcpServers": {
    "soropg": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/Soroban-Playground/mcp/dist/index.js"],
      "env": {
        "SOROPG_API_URL": "https://soropg.com",
        "SOROPG_API_KEY": "the-key-from-the-soropg-ai-tab"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add --transport stdio --scope user \
  --env SOROPG_API_URL=https://soropg.com \
  --env SOROPG_API_KEY=the-key-from-the-soropg-ai-tab \
  soropg -- node /absolute/path/to/Soroban-Playground/mcp/dist/index.js
```

Codex `~/.codex/config.toml`:

```toml
[mcp_servers.soropg]
command = "node"
args = ["/absolute/path/to/Soroban-Playground/mcp/dist/index.js"]
env = { SOROPG_API_URL = "https://soropg.com", SOROPG_API_KEY = "the-key-from-the-soropg-ai-tab" }
```

Environment-variable launch:

```bash
SOROPG_API_URL=https://soropg.com \
SOROPG_API_KEY=the-key-from-the-soropg-ai-tab \
node /absolute/path/to/Soroban-Playground/mcp/dist/index.js
```

File config alternative:

```json
{
  "apiUrl": "https://soropg.com",
  "apiKey": "the-key-from-the-soropg-ai-tab",
  "projectId": "optional-workspace-id"
}
```

Default path:

```text
~/.config/soropg-mcp/config.json
```

Set `SOROPG_CONFIG` to use a different config file path.

## Verify Connection

After adding the MCP server:
1. Restart or reload the MCP client.
2. In Claude Code, run `/mcp` and confirm `soropg` is connected.
3. Call `soropg_list_projects`.
4. If no projects appear, ask the user to confirm the SoroPG browser tab is still open and the same API key is configured.

## Available Tools

- `soropg_list_projects`: list browser workspaces visible to the key.
- `soropg_get_project`: fetch a workspace snapshot.
- `soropg_list_files`: list files in a workspace.
- `soropg_read_file`: read one file.
- `soropg_create_file`: create a new file.
- `soropg_replace_file`: replace a file's full contents.
- `soropg_apply_patch`: apply unified diff hunks to a file. Include `@@ -old,+new @@` hunk headers; do not send raw inserted `+` lines or Codex `*** Begin Patch` format.
- `soropg_delete_file`: delete a file.
- `soropg_move_file`: move or rename a file.
- `soropg_run_command`: run an allowed SoroPG command.

Allowed `soropg_run_command` values:
- `build`
- `test`
- `audit`

Deployment is not available through MCP v1 because deployment requires browser wallet signing.

## Recommended Agent Workflow

1. Call `soropg_list_projects`.
2. Select the user's intended workspace. If ambiguous, ask which workspace to use.
3. Call `soropg_list_files`.
4. Read the relevant files before editing.
5. Make focused edits with `soropg_apply_patch`, `soropg_replace_file`, or file creation tools.
6. Run `soropg_run_command` with `test` for behavior changes.
7. Run `soropg_run_command` with `build` before deployment handoff.
8. Tell the user that final deployment must happen in the browser.

## Soroban Workspace Notes

- The main contract source should be `src/lib.rs` or `lib.rs`.
- The preferred workspace layout is `Cargo.toml`, `src/lib.rs`, and `src/test.rs`.
- Keep file paths relative and safe. Do not use absolute paths or `..`.
- Large workspaces and very large files may be rejected by the SoroPG API.
- Build, test, and audit run inside the SoroPG Docker sandbox.

## Troubleshooting

If authentication fails:
- Check that `SOROPG_API_KEY` exactly matches the key in the SoroPG AI tab.
- Generate a new key and update the MCP client config.

If no workspaces are listed:
- Keep the SoroPG browser tab open.
- Confirm the browser is connected to the same `SOROPG_API_URL`.
- Click Generate in the AI tab if no key exists.

If the server fails to start:
- Confirm Node.js is version 20 or newer.
- Run `npm install` and `npm run build` in `Soroban-Playground/mcp`.
- Confirm the MCP client points to `mcp/dist/index.js`, not `src/index.ts`.

If a command fails:
- Read the command output from `soropg_run_command`.
- For source-file errors, first check that `src/lib.rs` exists.
- For deployment, hand off to the browser UI because MCP does not sign wallet transactions.
