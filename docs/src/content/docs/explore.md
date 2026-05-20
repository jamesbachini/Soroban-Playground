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

## Invoke methods

For each method, SoroPG renders input fields based on the contract spec. Enter arguments, then run the method.

Read-only simulations can return without submitting a transaction. State-changing calls require a connected or generated wallet and a signed transaction.

## Input formats

Use plain values for simple types such as strings, symbols, booleans, and integers. For complex values such as vectors, maps, tuples, options, results, bytes, and addresses, follow the field hint shown in the method form.

## Results

The method console shows simulation results, returned values, transaction hashes, and errors. When a transaction is submitted, SoroPG polls for confirmation and links to a Stellar explorer when possible.

## Local contracts

For local networks, configure RPC, Horizon, and network passphrase in **Settings** before loading or invoking local contracts.
