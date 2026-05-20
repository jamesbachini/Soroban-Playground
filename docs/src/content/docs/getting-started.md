---
title: Getting Started
description: Create your first SoroPG workspace and compile a Soroban contract.
---

SoroPG opens directly into the contract editor. The default workspace includes a `Cargo.toml`, `src/lib.rs`, and `src/test.rs` so you can compile and test immediately.

## First build

1. Open SoroPG.
2. Select **Create** in the left sidebar.
3. Edit `src/lib.rs` or keep the default contract.
4. Select **Build**.
5. Click **Compile to WASM**.

The build runs in the server-side Docker sandbox. When compilation succeeds, SoroPG downloads the compiled `.wasm` file automatically.

## First test

1. Select **Test**.
2. Click **Run Unit Tests**.
3. Watch the test console for `cargo test` output.

Tests are read from your active workspace. For the default project, test code is stored in `src/test.rs`.

## First deploy

1. Select **Deploy**.
2. Generate a local wallet or connect a browser wallet.
3. Choose a network.
4. Compile the contract if you have not already done so.
5. Click **Deploy WASM**.

SoroPG submits two transactions: one to upload the WASM and one to create the contract instance. The deploy console prints the WASM hash, transaction hashes, and contract ID.

## Browser storage

Workspaces, local wallet keys, theme, layout, and network choices are stored in your browser. Clearing browser data or using another browser will not preserve them. Export important projects and keys before resetting storage.
