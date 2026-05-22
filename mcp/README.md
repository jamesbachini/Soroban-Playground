# SoroPG MCP Server

`soropg-mcp` lets MCP-compatible coding agents work with Soroban Playground
workspaces. It connects your local MCP client to the SoroPG browser IDE through
the SoroPG API.

```text
MCP client -> soropg-mcp over stdio -> SoroPG API -> open browser IDE workspace
```

The server does not copy your project to disk and does not need to be run from
the Soroban Playground repository.

## Prerequisites

- Node.js 20 or newer.
- A SoroPG browser tab with the AI Assisted Development / MCP Setup panel open.
- A SoroPG MCP API key from that panel.

## Quick Check

Run this once to make sure Node can start the published MCP server:

```bash
npx soropg-mcp --help
```

You do not need to keep this command running. The command speaks MCP over stdio,
so it is normally started by Claude Code, Codex, or another MCP client from the
configuration below.

## Environment Variables

`SOROPG_API_KEY` is required unless you use a config file.

```bash
SOROPG_API_KEY=your-key-from-soropg
SOROPG_API_URL=https://soropg.com
SOROPG_PROJECT_ID=workspace-id
```

- `SOROPG_API_KEY`: required API key from the SoroPG AI Assisted Development / MCP Setup panel.
- `SOROPG_API_URL`: optional API URL. Defaults to `https://soropg.com`.
- `SOROPG_PROJECT_ID`: optional default workspace id. You can also pass
  `projectId` to each tool.
- `SOROPG_CONFIG`: optional path to a JSON config file.

Default config file location:

```text
~/.config/soropg-mcp/config.json
```

Example config file:

```json
{
  "apiUrl": "https://soropg.com",
  "apiKey": "your-key-from-soropg",
  "projectId": "workspace-id"
}
```

## Claude Code Config

Add this to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "soropg": {
      "command": "npx",
      "args": ["-y", "soropg-mcp"],
      "env": {
        "SOROPG_API_KEY": "your-key-from-soropg"
      }
    }
  }
}
```

## Codex Config

Add this to `~/.codex/config.toml`:

```toml
[mcp_servers.soropg]
command = "npx"
args = ["-y", "soropg-mcp"]
env = { SOROPG_API_KEY = "your-key-from-soropg" }
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

Allowed commands are `build`, `test`, and `audit`. `deploy` is present for
tool compatibility but returns unsupported in v1 so wallet signing stays in the
browser flow.

## Troubleshooting

Run `npx soropg-mcp --help` to confirm Node can start the MCP server.

If your MCP client says the server exited, check that `SOROPG_API_KEY` is set or
that `~/.config/soropg-mcp/config.json` contains `apiKey`.

If tools cannot find a workspace, keep the SoroPG browser IDE tab open and run
`soropg_list_projects`. Set `SOROPG_PROJECT_ID` only after you know the workspace
id.

If you are using a local SoroPG development server, set `SOROPG_API_URL`, for
example:

```bash
SOROPG_API_URL=http://127.0.0.1:3003
```

## Publishing

Prepare the package locally:

```bash
cd mcp
npm login
npm whoami
npm run build
npm pack
```

Check the generated `.tgz` contains only the expected package files. Then publish
manually:

```bash
npm publish --access public
```
