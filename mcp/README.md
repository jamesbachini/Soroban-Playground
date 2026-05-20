# SoroPG MCP Server

This package exposes Soroban Playground workspaces to MCP-compatible coding agents.

The server is a thin bridge:

```text
AI coding agent -> local MCP server over stdio -> SoroPG API -> open browser IDE workspace
```

It does not mirror project files locally. It only reads local configuration.

## Setup

1. Open SoroPG in a browser.
2. Open the AI tab.
3. Generate a user API key and keep that tab open.
4. Install and build this package:

```bash
cd mcp
npm install
npm run build
```

## Configuration

Use environment variables:

```bash
SOROPG_API_URL=https://soropg.com
SOROPG_API_KEY=your-key-from-the-browser
node /path/to/Soroban-Playground/mcp/dist/index.js
```

Optionally set `SOROPG_PROJECT_ID` after running `soropg_list_projects`.

You can also use `~/.config/soropg-mcp/config.json`:

```json
{
  "apiUrl": "https://soropg.com",
  "apiKey": "your-key-from-the-browser",
  "projectId": "workspace-id"
}
```

## MCP Client Example

```json
{
  "mcpServers": {
    "soropg": {
      "command": "node",
      "args": ["/path/to/Soroban-Playground/mcp/dist/index.js"],
      "env": {
        "SOROPG_API_URL": "https://soropg.com",
        "SOROPG_API_KEY": "your-key-from-the-browser"
      }
    }
  }
}
```

## Tools

- `soropg_list_projects`
- `soropg_get_project`
- `soropg_list_files`
- `soropg_read_file`
- `soropg_create_file`
- `soropg_replace_file`
- `soropg_apply_patch`
- `soropg_delete_file`
- `soropg_move_file`
- `soropg_run_command`

Allowed commands are `build`, `test`, and `audit`. `deploy` returns an unsupported v1 error so signing remains in the browser wallet flow.
