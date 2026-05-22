---
title: AI Assistants
description: Connect Claude Code, Codex, and other MCP clients to your SoroPG workspace.
---

SoroPG can connect to AI coding assistants through the `soropg-mcp` package. This lets an assistant read and edit files in your open SoroPG browser workspace, then run SoroPG build, test, and audit commands.

## Before you start

You need:

- Node.js 20 or newer.
- SoroPG open in your browser.
- An MCP API key from the SoroPG AI Assisted Development / MCP Setup panel.

Keep the SoroPG tab open while your assistant is connected.

## Quick check

Run this once in a terminal to make sure npm can start the MCP server:

```bash
npx soropg-mcp --help
```

You do not need to keep this command running. Your AI assistant will start `soropg-mcp` from its MCP config.

## Codex setup

Open `~/.codex/config.toml` and add:

```toml
[mcp_servers.soropg]
command = "npx"
args = ["-y", "soropg-mcp"]
env = { SOROPG_API_KEY = "paste-your-soropg-api-key-here" }
```

Restart Codex. You should see SoroPG tools such as `soropg_list_projects`, `soropg_read_file`, and `soropg_run_command`.

## Claude Code setup

Add this MCP server to your Claude Code config:

```json
{
  "mcpServers": {
    "soropg": {
      "command": "npx",
      "args": ["-y", "soropg-mcp"],
      "env": {
        "SOROPG_API_KEY": "paste-your-soropg-api-key-here"
      }
    }
  }
}
```

Restart Claude Code after saving the config.

## Optional settings

Most users only need `SOROPG_API_KEY`.

Use these only if needed:

```bash
SOROPG_API_URL=https://soropg.com
SOROPG_PROJECT_ID=workspace-id
```

- `SOROPG_API_URL` defaults to `https://soropg.com`.
- `SOROPG_PROJECT_ID` sets a default workspace. If you skip it, ask the assistant to run `soropg_list_projects` first.

## What the assistant can do

The MCP server gives your assistant access to SoroPG tools for listing projects, reading files, creating files, replacing files, applying patches, deleting files, moving files, and running build, test, or audit.

The assistant can only reach workspaces exposed through your active SoroPG browser session and API key.

## Troubleshooting

If the assistant cannot connect, run:

```bash
npx soropg-mcp --help
```

If that fails, install or update Node.js.

If the assistant says `SOROPG_API_KEY` is missing, check that the key is pasted into the MCP config and restart the assistant.

If no projects are found, keep the SoroPG browser tab open and ask the assistant to run `soropg_list_projects`.

If you are running a local SoroPG development server, add `SOROPG_API_URL` to the MCP config:

```toml
env = { SOROPG_API_URL = "http://127.0.0.1:3003", SOROPG_API_KEY = "paste-your-soropg-api-key-here" }
```
