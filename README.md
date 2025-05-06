# Soroban Playground

An online IDE for Stellar Soroban developers

## Architecture

- Requires a server running docker and rust (setup instructions below). Building and testing contracts takes place in a sandboxed docker container.
- Frontend uses Stellar SDK and Freighter API

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