# Soroban Playground

An online IDE for Stellar Soroban developers

It's simple but capable with the ability to create soroban contracts, run unit tests, deploy contracts to testnet/mainnet and there's an integration section for invoking contract functions with the js-stellar-sdk.

## Architecture

- Building and testing contracts takes place in a sandboxed docker container.
- API and frontend are delivered via a Rust app
- Frontend uses Stellar SDK and Freighter API

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

## License

MIT

## Contributing

Yes please :)