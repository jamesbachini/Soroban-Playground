# Soroban Playground

An online IDE for Stellar Soroban developers

It's simple but capable with the ability to create soroban contracts, run unit tests, deploy contracts to testnet/mainnet and there's an integration section for invoking contract functions with the js-stellar-sdk.

## Architecture

- Building and testing contracts takes place in a sandboxed docker container.
- API and frontend are delivered via a Rust app
- Frontend uses Stellar SDK and Freighter API

## Crates Available

- soroban-sdk
- sep-41-token
- soroban-fixed-point-math
- blend-contract-sdk
- openzeppelin_constants
- openzeppelin_default_imp_macro
- openzeppelin_event_assertion
- openzeppelin_fungible_token
- openzeppelin_non_fungible_token
- openzeppelin_pausable
- openzeppelin_pausable_macros
- openzeppelin_upgradeable
- openzeppelin_upgradeable_macros

Full versions available here: https://github.com/jamesbachini/Soroban-Playground/blob/main/src/templates/Cargo.toml.template

If you want something else submit a pull request (preferably with a link to a 3rd party audit)

## Requirements

Docker & Rust

https://www.docker.com/

https://www.rust-lang.org/


## Local Testing
Follow these commands to install locally

```bash
# Install docker and rust
sudo curl --proto '=https' --tlsv1.2 -sSf https://get.docker.com | sh
sudo curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add permissinos and start docker
sudo usermod -aG docker $USER
sudo systemctl start docker

# Download and run repo
git clone https://github.com/jamesbachini/Soroban-Playground.git
docker build -f Dockerfile.sandbox -t wasm_sandbox .
cargo run

# Open up a browser on http://127.0.0.1:8080
```

## Production
As above but add a crontab to restart the app on reboot. Also need to change the port number to 80 and setup https redirect using something like cloudflare. Currently setup to handle 4 concurrent sandboxed builds, using 1 cpu and 1G ram each. This is configurable and may require optimisation. App doesn't require session info so would be well suited to auto-scaling via additional instances behind a load balancer.

```bash
crontab -e
// Add this line
@reboot cd /project/directory && cargo run
```

## 2 do
- Multifile support
- Split contracts and tests
- Export integration to HTML/JS
- WASM hash > file cache for common contracts
- CustomGPT Chatbot integration
- Rust linter
- More wallets supported


## License

MIT


## Contributing

Yes please 💗♥️❤️