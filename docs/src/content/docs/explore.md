---
title: Explore Contracts
description: Inspect and invoke deployed Soroban contracts with SoroPG.
---

The **Explore** panel loads a deployed contract by contract ID and network.

## Load a contract

1. Select **Explore**.
2. Choose the network.
3. Paste the contract ID.
4. Click the load button.

SoroPG requests the contract interface from the server and also attempts to load the contract spec through Stellar SDK. The UI then renders forms for available contract methods.

The selected network is shared with the Deploy panel. If a contract does not load, first confirm that the network selector matches where the contract was deployed.

## Invoke methods

For each method, SoroPG renders input fields based on the contract spec. Enter arguments, then run the method.

Read-only simulations can return without submitting a transaction. State-changing calls require a connected or generated wallet and a signed transaction.

## Input formats

Use plain values for simple types such as strings, symbols, booleans, and integers. For complex values such as vectors, maps, tuples, options, results, bytes, and addresses, follow the field hint shown in the method form.

For addresses, use a valid Stellar account or contract address. For byte values, follow the displayed hint for hex or base64 input. For nested values, prefer JSON-like input when the field hint asks for structured data.

## Results

The method console shows simulation results, returned values, transaction hashes, and errors. When a transaction is submitted, SoroPG polls for confirmation and links to a Stellar explorer when possible.

If simulation succeeds but submission fails, check wallet signing, account funding, network fees, and whether the method changes state.

## Local contracts

For local networks, configure RPC, Horizon, and network passphrase in **Settings** before loading or invoking local contracts.
