---
title: "SoroPG + Agentic AI via MCP"
description: Connect Codex, Claude Code, or another MCP client to a live SoroPG browser workspace.
---

SoroPG can expose your open browser workspace to agentic coding tools through the `soropg-mcp` server. This lets tools such as Codex or Claude Code inspect files, edit projects, and run SoroPG build, test, and audit commands while SoroPG remains the live contract workspace.

Keep the SoroPG tab open while using MCP. The browser session is the bridge.

## What MCP adds

The built-in AI assistant is useful for focused browser-based edits. MCP is for external agentic tools that can work across files, inspect project state, and run tool calls as part of a longer coding task.

Through MCP, an agent can:

- List SoroPG projects.
- Read files from a workspace.
- Create, replace, patch, move, or delete files.
- Run build, test, and audit commands.

Only expose workspaces you are comfortable letting the agent inspect or edit.

## Open MCP setup in SoroPG

1. Open **Academy**.
2. Select **SoroPG + Agentic AI = Magic: Claude Code or Codex via MCP**.
3. Click **Open MCP Setup**.

The setup panel shows the browser bridge state, API URL, active workspace, and the API key your local MCP server needs.

## Generate a browser key

Generate a SoroPG MCP key from the setup panel. This key authorizes the local `soropg-mcp` process to reach your open browser session.

Keep the key private. If you rotate or clear it, update your MCP client config.

## Confirm Node.js

The MCP server is started with `npx`, so your local machine needs Node.js 20 or newer.

Run:

```bash
npx soropg-mcp --help
```

This checks that npm can fetch and start the package. Your MCP client will run the server automatically after configuration.

## Configure Codex

Add a SoroPG MCP server entry to `~/.codex/config.toml`:

```toml
[mcp_servers.soropg]
command = "npx"
args = ["-y", "soropg-mcp"]
env = { SOROPG_API_KEY = "paste-your-soropg-api-key-here" }
```

Restart Codex after saving the file.

For local SoroPG development, include the local server URL:

```toml
[mcp_servers.soropg]
command = "npx"
args = ["-y", "soropg-mcp"]
env = { SOROPG_API_URL = "http://127.0.0.1:3003", SOROPG_API_KEY = "paste-your-soropg-api-key-here" }
```

## Configure Claude Code

Add the MCP server to your Claude Code config:

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

## Verify the connection

Ask the agent to list SoroPG projects. It should call a tool such as `soropg_list_projects` and return the workspaces exposed by your open browser tab.

Then ask it to read one file from the active workspace. Start with inspection before allowing edits.

Good first prompt:

```text
List my SoroPG projects, identify the active workspace, then read src/lib.rs and summarize the contract without editing anything.
```

## Let the agent make one controlled edit

Once inspection works, ask for a small, reviewable change.

Example:

```text
In the active SoroPG workspace, add one unit test for the existing hello function.
Use the smallest patch possible, then run the SoroPG test command.
```

Review every changed file in SoroPG after the agent finishes. If the agent ran tests, read the output. If it did not run tests, run them yourself.

## Finish the course

Return to Academy and mark the course complete after you have:

- Generated a SoroPG MCP key.
- Configured an external MCP client.
- Confirmed the agent can list projects.
- Asked the agent to inspect or safely edit a workspace.
- Reviewed the result in SoroPG.

## Troubleshooting

If the agent cannot find projects, keep the SoroPG browser tab open and refresh the MCP setup panel.

If the agent says the API key is missing, paste the current key into the MCP config and restart the client.

If `npx soropg-mcp --help` fails, update Node.js or check npm access.

If you are using a local SoroPG server, set `SOROPG_API_URL` to the local origin.
