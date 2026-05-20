---
title: Troubleshooting
description: Common SoroPG errors and how to resolve them.
---

## Build says no source file was found

Make sure your workspace contains `src/lib.rs` or `lib.rs`. SoroPG uses those paths as the main contract source.

If you imported from GitHub or ZIP, check whether the project was nested inside an extra folder.

## Build or test takes a long time

The sandbox may be compiling Rust dependencies. Wait for the console output to finish. Repeated builds are usually faster because the server uses a shared Cargo cache volume.

## WASM did not download

Check the build console for errors. The WASM download only starts after `stellar contract build` completes successfully.

Some browsers may block automatic downloads. If the build succeeded but no file appeared, check the browser download shelf and permissions for the SoroPG site.

## Deploy asks for a file

This is expected. SoroPG deploys a `.wasm` file from your browser. Compile first in the **Build** panel, then select the downloaded WASM when deploying.

## Wallet funding failed

Check the selected network. Testnet and futurenet use public friendbots. Local funding requires a local friendbot endpoint in Settings. Mainnet cannot be funded by friendbot.

## Local network calls fail

Confirm that your local Stellar services are running and that the Settings values match your environment:

- RPC URL
- Horizon URL
- Network passphrase

If you use Stellar quickstart locally, confirm that ports are exposed to the browser and to the SoroPG server process.

## Contract interface does not load

Verify the contract ID and network. If the contract exists on a local network, make sure the local configuration is selected before loading the contract.

Also confirm the contract was created successfully, not only that the WASM upload transaction succeeded.

## Browser state disappeared

SoroPG stores workspaces and generated wallets in browser storage. Browser cleanup tools, private windows, different browsers, or profile changes can remove that data. Export workspace ZIPs and wallet keys when they matter.

## Reset editor

Use **Settings > Reset Editor** to clear locally stored code and wallets and restore the default template. Export anything important before resetting.
