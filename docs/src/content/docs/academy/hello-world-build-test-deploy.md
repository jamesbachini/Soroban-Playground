---
title: "Hello World: Build, Test, and Deploy"
description: Import, test, build, deploy, verify, and invoke your first Soroban contract in SoroPG.
---

This course walks through the first complete Soroban contract loop in SoroPG. You will import Stellar's `hello_world` example, read the Rust contract structure, run the unit test, build the WASM file, deploy to Stellar Testnet, verify the contract in Academy, and invoke the deployed method from Explore.

You do not need a local Rust toolchain for this course. SoroPG sends builds and tests to the server-side Docker sandbox.

## What you will build

The contract exposes one method named `hello`. The method accepts a `String` and returns a `Vec<String>` containing a greeting and the value you passed in.

This is intentionally small. The goal is to learn the development workflow before adding storage, authorization, or cross-contract calls.

## Start the course material

1. Open **Academy**.
2. Select **Hello World: Build, Test, and Deploy**.
3. Click **Open Course Material**.

SoroPG imports the example into a fresh workspace and leaves the editor visible above the Academy panel. Open `src/lib.rs` first.

## Read the contract

The important pieces are:

- `#![no_std]` keeps the contract compatible with the constrained WASM environment.
- `use soroban_sdk::{contract, contractimpl, vec, Env, String, Vec};` imports the SDK macros and contract-friendly types.
- `#[contract]` marks the contract struct.
- `#[contractimpl]` exposes functions in the `impl` block as contract methods.
- `Env` gives the function access to host-provided ledger and contract APIs.
- `String` is the SDK string type used for contract interface text values.
- `Vec<String>` is the SDK vector type returned to callers.

The exported function is ordinary Rust syntax:

```rust
pub fn hello(env: Env, to: String) -> Vec<String> {
    vec![&env, String::from_str(&env, "Hello"), to]
}
```

The `env` value is passed into the SDK `vec!` macro because contract collections are host-managed values.

## Run the unit test

Before building or deploying, run the test.

1. Open the **Test** panel, or use **Run Unit Tests** from the Academy course page.
2. Click **Run Unit Tests**.
3. Wait for the console to finish.

The test registers the contract in a local simulated environment, calls `hello`, and checks the returned strings. This is the fastest feedback loop. Use it before every build and deploy.

If the test fails, read the error from the bottom console and return to the editor. Common causes are changing the returned greeting without updating the expected value, renaming the contract type, or removing an SDK import that the macro still needs.

## Make a small change

Try one controlled edit before deploying:

1. Change the greeting string from `Hello` to another string.
2. Run tests.
3. Update the test expectation if needed.
4. Run tests again until they pass.

This teaches the normal edit-test loop: make one behavior change, run the nearest test, and only continue once the result is understood.

## Build the WASM

1. Open **Build**, or click **Compile Contract** in Academy.
2. Click **Compile to WASM**.
3. Wait for the build console to finish.

SoroPG runs `stellar contract build` in the Docker sandbox. On success, your browser downloads the compiled `.wasm` file. Keep that file for deployment.

If build fails after tests passed, check `Cargo.toml`, feature flags, and imports. Unit tests compile a native test target, while deployment requires a contract WASM target.

## Deploy to Testnet

1. Open **Deploy**, or click **Deploy Contract** in Academy.
2. Use Testnet.
3. Generate a development wallet or connect a browser wallet.
4. Fund the account if needed.
5. Click **Deploy WASM**.
6. Select the downloaded `.wasm` file.

SoroPG uploads the WASM, creates a contract instance, and prints the contract ID in the deploy console. Contract IDs start with `C`.

## Verify completion in Academy

Return to the Academy course page and paste the Testnet contract ID into the verification field.

Academy checks Testnet and confirms that the deployed contract exposes the expected `hello` method. When verification succeeds, the course is marked complete in browser-local progress.

## Invoke the deployed contract

1. Copy the contract ID.
2. Open **Explore**.
3. Paste the contract ID and load the contract.
4. Find the `hello` method.
5. Enter a string value such as `SoroPG`.
6. Invoke the method.

Explore renders forms from the contract interface. This final step proves that the deployed contract can be inspected and called after deployment.

## What to remember

- Tests are the first feedback loop.
- WASM builds are required before deployment.
- Testnet deployment gives you a real contract ID.
- Explore is how you inspect and call deployed contracts from SoroPG.
- Academy verification checks the deployed interface, not just local code.
