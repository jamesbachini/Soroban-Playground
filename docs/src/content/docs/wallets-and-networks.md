---
title: Wallets and Networks
description: Configure wallets and Stellar networks in SoroPG.
---

Wallet and network state is shared between the Deploy and Explore panels.

## Networks

SoroPG supports these network choices:

- **Testnet** uses Stellar testnet services.
- **Futurenet** uses Stellar futurenet services.
- **Mainnet** uses the public Stellar network.
- **Local** uses the RPC, Horizon, and passphrase configured in Settings.

The selected network is saved in browser storage.

## Generated wallets

Click **Generate Wallet** to create a local Stellar keypair in the browser. SoroPG can use this keypair to sign deploy and invocation transactions.

Generated wallets are convenient for development but must be exported if you need to keep them. Browser storage is not a secure long-term key vault.

## Browser wallets

SoroPG integrates with Stellar Wallet Kit for browser wallet connections. When a browser wallet is connected, signing requests are sent to that wallet instead of using a local secret key.

## Funding wallets

The wallet menu includes funding support:

- Testnet uses Stellar testnet friendbot.
- Futurenet uses futurenet friendbot.
- Local uses the configured local friendbot endpoint through SoroPG's `/friendbot` proxy.
- Mainnet does not have friendbot funding.

## Local network configuration

Open **Settings** to configure:

- RPC URL
- Horizon URL
- Network passphrase

The default local values match a typical Stellar quickstart local network:

```text
RPC URL: http://localhost:8000/rpc
Horizon URL: http://localhost:8000
Network passphrase: Standalone Network ; February 2017
```
