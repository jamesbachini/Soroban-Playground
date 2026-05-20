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

## Unit tests

The **Test** panel runs:

```bash
cargo test
```

Use `src/test.rs` for contract tests. Large test suites can take time because the sandbox may need to compile dependencies.

## Scout audit

The **Scout Audit** button runs a Scout audit command in the sandbox. It is intended to catch common Soroban contract issues during development.

Scout audit output should be treated as a development signal, not a substitute for code review, complete test coverage, or an external audit.

## Caching

The server uses a shared Docker volume named `cargo-cache` to speed up repeated builds. If builds behave unexpectedly after dependency changes, the server operator may need to clear the cache volume.

## Main source file

For build, test, and audit requests, SoroPG looks for the main source in this order:

1. `src/lib.rs`
2. `lib.rs`

If neither file exists, the server returns a bad request error.
