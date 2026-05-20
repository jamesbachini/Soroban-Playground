---
title: Deploy Contracts
description: Deploy compiled Soroban contracts from SoroPG.
---

The **Deploy** panel uploads contract WASM and creates a deployed contract instance on the selected network.

Deploying from SoroPG uses a `.wasm` file selected from your browser. Build the contract first, keep the downloaded WASM, then choose that file when you click **Deploy WASM**.

## Supported networks

SoroPG supports:

- Testnet
- Futurenet
- Mainnet
- Local/custom network

Use testnet or a local network while developing. Mainnet transactions are real and require real XLM.

## Wallet options

You can generate a local keypair in the browser or connect a supported browser wallet through Stellar Wallet Kit.

Generated local wallets are stored in browser storage. Export the secret key if you need to keep the wallet. Disconnecting or resetting the editor can remove local wallet data.

## Deployment flow

SoroPG performs deployment in two steps:

1. Upload the compiled WASM.
2. Create the contract instance.

The deploy console shows transaction progress, the WASM hash, and the deployed contract ID. Copy the contract ID before leaving the page if you plan to interact with it later.

If your contract has a constructor, add constructor arguments before deployment. SoroPG converts those values into Soroban `ScVal` values and includes them in the create-contract transaction.

## Funding

Generated wallets request funds for testnet and futurenet automatically. Local network funding uses the local friendbot configuration. Mainnet wallets must already hold enough XLM for fees and minimum balance.

## After deployment

Use the **Load Contract** link in the deploy console to open the contract in **Explore**, or copy the contract ID and load it later. The selected network in Deploy and Explore is shared, so make sure it still matches where the contract was deployed.

## Before deploying to mainnet

Review the source code, dependencies, constructor behavior, and wallet account. Run unit tests and audit checks first. SoroPG is useful for deployment, but it does not replace a release process.
