---
title: Getting Started
description: Create your first SoroPG workspace and compile a Soroban contract.
---

SoroPG opens directly into the editor. A new browser profile starts with a default workspace that includes `Cargo.toml`, `src/lib.rs`, and `src/test.rs`, so you can compile and test immediately.

You do not need a local Rust toolchain to use the hosted SoroPG app. The server handles build and test execution in Docker. You only need a browser and, for deployment, a funded Stellar account or a generated development wallet.

## First build

1. Open SoroPG.
2. Select **Create** in the left sidebar.
3. Edit `src/lib.rs`, or keep the default contract for the first run.
4. Select **Build**.
5. Click **Compile to WASM**.

The build runs in the server-side Docker sandbox using the full active workspace. When compilation succeeds, SoroPG downloads the compiled `.wasm` file automatically. Keep that file if you plan to deploy from the **Deploy** panel.

## First test

1. Select **Test**.
2. Click **Run Unit Tests**.
3. Watch the test console for `cargo test` output.

Tests are read from your active workspace. For the default project, test code is stored in `src/test.rs`. If you change dependencies in `Cargo.toml`, the next test run may take longer while the sandbox rebuilds.

## First deploy

1. Select **Deploy**.
2. Generate a local wallet or connect a browser wallet.
3. Choose a network.
4. Compile the contract and keep the downloaded `.wasm` file.
5. Click **Deploy WASM**.
6. Select the `.wasm` file when your browser prompts for it.

SoroPG submits two transactions: one to upload the WASM and one to create the contract instance. If your contract constructor requires arguments, add them in the deploy panel before creating the instance. The deploy console prints the WASM hash, transaction hashes, and contract ID.

## First explore

After deployment, use the **Load Contract** link in the deploy console or copy the contract ID into **Explore**. SoroPG will load the interface and render method forms for contract calls.

## Browser storage

Workspaces, local wallet keys, theme, layout, and network choices are stored in your browser. Clearing browser data or using another browser will not preserve them. Export important projects and keys before resetting storage.
