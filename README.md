# Soroban Playground

An online IDE for Stellar Soroban developers

It's simple but capable with the ability to create soroban contracts, run unit tests, deploy contracts to testnet/mainnet and there's an integration section for invoking contract functions with the js-stellar-sdk.

## Architecture

- Building and testing contracts takes place in a sandboxed docker container.
- API and frontend are delivered via a Rust app
- Frontend uses Stellar SDK and Freighter API

## Crates Available

soroban-sdk = "22.0.7"
sep-41-token = "1.2.0"
stellar-constants = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-default-impl-macro = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-event-assertion = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-fungible = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-non-fungible = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-pausable = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-pausable-macros = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-upgradeable = { git = "https://github.com/OpenZeppelin/stellar-contracts" }
stellar-upgradeable-macros = { git = "https://github.com/OpenZeppelin/stellar-contracts" }

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