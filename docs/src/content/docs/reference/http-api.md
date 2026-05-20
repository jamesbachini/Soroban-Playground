---
title: HTTP API
description: Reference for SoroPG server endpoints used by the frontend.
---

The SoroPG frontend calls these endpoints on the same origin as the editor. Build, test, audit, and interface endpoints stream plain text responses.

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
- On success, the stream includes an encoded WASM payload used by the frontend to download the `.wasm` file.
- `400` if no source code or main source file is provided.
- `503` if the sandbox semaphore is unavailable.

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
