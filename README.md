# Soroban Playground

An online IDE for Stellar Soroban developers

It's simple but capable with the ability to create soroban contracts, run unit tests, deploy contracts to testnet/mainnet and there's an integration section for invoking contract functions with the js-stellar-sdk.

## Architecture

- Building and testing contracts takes place in a sandboxed docker container.
- API and frontend are delivered via a Rust app
- Frontend uses Stellar SDK and Freighter API

## Crates Available

- soroban-sdk = "22.0.7"
- sep-41-token = "1.2.0"
- soroban-fixed-point-math = "1.3.0"
- blend-contract-sdk = "2.22.0"
- openzeppelin_constants = { package = "stellar-constants", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_default_imp_macro = { package = "stellar-default-impl-macro", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_event_assertion = { package = "stellar-event-assertion", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_fungible_token = { package = "stellar-fungible", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_non_fungible_token = { package = "stellar-non-fungible", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_pausable = { package = "stellar-pausable", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_pausable_macros = { package = "stellar-pausable-macros", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_upgradeable = { package = "stellar-upgradeable", git = "https://github.com/OpenZeppelin/stellar-contracts" }
- openzeppelin_upgradeable_macros = { package = "stellar-upgradeable-macros", git = "https://github.com/OpenZeppelin/stellar-contracts" }

If you want something else submit a pull request (preferably with a link to a 3rd party audit)

## Requirements

Docker & Rust

https://www.docker.com/

https://www.rust-lang.org/


## Testing
```bash
sudo usermod -aG docker $USER
sudo systemctl start docker
docker build -f Dockerfile.sandbox -t wasm_sandbox .
cargo run
```
Open up a browser on http://127.0.0.1:8080


## Production
```bash
sudo usermod -aG docker $USER
sudo systemctl enable docker
docker build -f Dockerfile.sandbox -t wasm_sandbox .

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

## License

MIT

## Contributing

Yes please 💗♥️❤️