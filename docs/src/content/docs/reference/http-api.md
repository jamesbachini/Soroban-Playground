---
title: HTTP API
description: Reference for SoroPG server endpoints used by the frontend.
---

The SoroPG frontend calls these endpoints on the same origin as the editor. Build, test, audit, and interface endpoints stream plain text responses.

These endpoints are primarily internal to the SoroPG frontend. They are useful for understanding behavior or building local tooling, but request and stream formats are optimized for the browser UI.

## POST /compile

Compiles the active contract project to WASM.

Request body:

```json
{
  "files": {
    "Cargo.toml": "...",
    "src/lib.rs": "...",
    "src/test.rs": "..."
  }
}
```

Legacy single-file requests can use:

```json
{
  "code": "..."
}
```

Response:

- `200 text/plain` streaming build output.
- On success, the stream includes an encoded WASM payload between SoroPG markers. The frontend extracts that payload and downloads the `.wasm` file.
- `400` if no source code or main source file is provided.
- `503` if the sandbox semaphore is unavailable.

The server hashes the submitted files for build caching. File entries are sorted before hashing so equivalent file maps produce stable cache keys.

## POST /test

Runs unit tests for the active project.

Request body matches `/compile`.

Response:

- `200 text/plain` streaming `cargo test` output.
- `400` if no source code or main source file is provided.
- `503` if the sandbox semaphore is unavailable.

## POST /scout-audit

Runs Scout audit checks for the active project.

Request body matches `/compile`.

Response:

- `200 text/plain` streaming audit output.
- `400` if no source code or main source file is provided.
- `503` if the sandbox semaphore is unavailable.

## POST /interface

Loads a contract interface through the sandboxed Stellar CLI.

Request body:

```json
{
  "contract": "CONTRACT_ID",
  "network": "testnet"
}
```

Response:

- `200 text/plain` streaming interface output.
- Errors are returned in the text stream.

The server sanitizes the network and contract ID before building the CLI command. Public and futurenet requests include explicit RPC URLs and network passphrases.

## GET /friendbot

Proxies local friendbot funding requests.

Query parameters:

- `addr`: account public key to fund.
- `friendbot_url`: optional local friendbot base URL.

Only `localhost`, `127.0.0.1`, and `::1` friendbot hosts are allowed. This endpoint is for local network development, not public friendbot use.

Example:

```text
/friendbot?addr=G...&friendbot_url=http://localhost:8000/friendbot
```

Responses preserve the upstream status code and content type where possible.

## MCP bridge API

The MCP bridge API is used by the local TypeScript MCP server in `mcp/`. It is authenticated with:

```text
Authorization: Bearer USER_API_KEY
```

The browser IDE generates the key from **Settings > AI / MCP Access** and keeps the user's current workspaces connected while the tab is open. The v1 bridge does not persist remote projects after the browser session expires.

Project endpoints:

- `GET /api/mcp/v1/projects`
- `GET /api/mcp/v1/projects/{project_id}`
- `GET /api/mcp/v1/projects/{project_id}/files`
- `GET /api/mcp/v1/projects/{project_id}/file?path=src/lib.rs`
- `POST /api/mcp/v1/projects/{project_id}/file`
- `DELETE /api/mcp/v1/projects/{project_id}/file?path=src/lib.rs`
- `POST /api/mcp/v1/projects/{project_id}/move`
- `POST /api/mcp/v1/projects/{project_id}/commands`

Browser relay endpoints:

- `POST /api/mcp/v1/browser/heartbeat`
- `GET /api/mcp/v1/browser/changes?session_id=...&since=0`

File paths use the same safe relative path rules as the IDE. Command execution is whitelisted to `build`, `test`, and `audit`; `deploy` returns an unsupported v1 error so transaction signing remains in the browser wallet flow.

## Static routes

The same Rust process also serves:

- `/` from the SoroPG frontend directory.
- `/docs/` from the generated Starlight documentation build.
- `/llms.txt` from the frontend static directory for AI-agent context.
