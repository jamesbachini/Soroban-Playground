---
title: Build, Test, and Audit
description: Compile contracts, run unit tests, and use Scout audit in SoroPG.
---

SoroPG runs build, test, and audit commands in the Docker sandbox configured by the server. These commands use the files from the active workspace.

## Compile to WASM

The **Build** panel runs:

```bash
stellar contract build
```

SoroPG streams build output to the console. On success it extracts the compiled WASM, encodes it in the server response, and downloads it in your browser.

The downloaded filename is based on the contract name SoroPG detects from the main source file. If detection fails, check that your contract macro and struct are in `src/lib.rs` or `lib.rs`.

## Unit tests

The **Test** panel runs:

```bash
cargo test
```

Use `src/test.rs` for contract tests. Large test suites can take time because the sandbox may need to compile dependencies.

The test command runs against the entire active workspace, including any edits to `Cargo.toml`. If the console shows dependency or compiler errors, fix them in the editor and rerun the command.

## Scout audit

The **Scout Audit** button runs a Scout audit command in the sandbox. It is intended to catch common Stellar contract issues during development.

Scout audit output should be treated as a development signal, not a substitute for code review, complete test coverage, or an external audit.

## Reading command output

The build and test consoles stream output from the server. A blank pause usually means the sandbox process is still running. SoroPG sends lightweight heartbeat data during long commands to keep the HTTP stream alive.

Compilation succeeds only when the WASM payload is returned. Tests and Scout audit report their status from the streamed output markers.

## Caching

The server uses a shared Docker volume named `cargo-cache` to speed up repeated builds. If builds behave unexpectedly after dependency changes, the server operator may need to clear the cache volume.

## Main source file

For build, test, and audit requests, SoroPG looks for the main source in this order:

1. `src/lib.rs`
2. `lib.rs`

If neither file exists, the server returns a bad request error.
