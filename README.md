# Soroban Playground

An online IDE for Stellar Soroban developers

Available at https://soropg.com

It's simple but capable with the ability to create soroban contracts, all the openzeppelin stuff works (can copy and paste from the contract wizard), can use it to run unit tests, deploy contracts to testnet/mainnet and there's an integration section for invoking contract functions with the js-stellar-sdk. All point and click functionality to make it as easy as possible.

## Architecture

- Building and testing contracts takes place in a sandboxed docker container.
- API and frontend are delivered via a Rust app
- Frontend uses Stellar SDK and Freighter API currently

## Crates Available

- soroban-sdk
- sep-41-token
- soroban-fixed-point-math
- blend-contract-sdk
- stellar-constants
- stellar-default-impl-macro
- stellar-fungible
- stellar-non-fungible
- stellar-pausable
- stellar-pausable-macros
- stellar-upgradeable
- stellar-upgradeable-macros
- stellar-ownable
- stellar-ownable-macro
- stellar-access-control
- stellar-access-control-macros
- stellar-crypto
- stellar-merkle-distributor

nb. stellar-event-assertion is not supported as it wont compile with wasm32v1-none

Full version info available here: https://github.com/jamesbachini/Soroban-Playground/blob/main/src/templates/Cargo.toml.template

If you want something else submit a pull request (preferably with a link to a 3rd party audit)


## Requirements

Docker & Rust and ideally some variation of linux, tested on Ubuntu 25.04 via gcloud instance and WSL on windows.

- https://www.docker.com/
- https://www.rust-lang.org/


## Local Testing
Follow these commands to install locally. If on windows I'd recommend using windows subsystem for linux, for mac the commands might need changing for apt/systemctl etc.

```bash
# Install rust, docker & build tools
sudo curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo curl --proto '=https' --tlsv1.2 -sSf https://get.docker.com | sh
sudo apt update
sudo apt install build-essential

# Clone the repo
git clone https://github.com/jamesbachini/Soroban-Playground.git
cd Soroban-Playground

# Add permissions and start docker, change $USER to whoever is running it
# Log out and log back in before running docker build
sudo usermod -aG docker $USER
sudo systemctl start docker
exit
docker volume create cargo-cache
docker build -f Dockerfile.sandbox -t wasm_sandbox .

# Build the app, authorize port 80 using setcap and run the binary
cargo build --release
sudo setcap 'cap_net_bind_service=+ep' target/release/Soroban-Playground
./target/release/Soroban-Playground

# Open up a browser on http://127.0.0.1
```

## Production
Additional steps to run it up on a remote server

Currently setup to handle 4 concurrent sandboxed builds, using 1 cpu and 1G ram each. This is configurable and may require optimisation. App doesn't require session info so would be well suited to auto-scaling via additional instances behind a load balancer (in theory).

```bash
# Enable docker after reset
sudo systemctl enable docker

# build a release binary
cargo build --release

#  Enable that binary to bind to port 80
sudo setcap 'cap_net_bind_service=+ep' target/release/Soroban-Playground

# Add crontab line, change $USERNAME to your home directory
crontab -e

@reboot echo "." > /tmp/project.wasm; chmod 664 /tmp/project.wasm
@reboot cd /home/$USERNAME/Soroban-Playground; /home/$USERNAME/Soroban-Playground/target/release/Soroban-Playground
0 1 * * * cd /home/$USERNAME/Soroban-Playground; docker run --rm -v cargo-cache:/cache alpine sh -c "rm -rf /cache/target/debug /cache/target/tmp"
```

Replace $USERNAME in the crontab with the user account that has access

Then turn it off then on again and keep everything crossed 🤞


## Updating

Update the cloned github repo to the latest version by pulling in any changes.

```bash
# Move into the directory
cd ~/Soroban-Playground/

# Pull latest from remote
git pull origin main

# Optional reset any local changes
git fetch origin
git reset --hard origin/main

# Optional update OZ or other dependencies in cargo.toml.template
docker system prune -a
docker run --rm -v cargo-cache:/cache alpine sh -c "rm -rf /cache/target/debug /cache/target/tmp"
docker volume create cargo-cache
docker build -f Dockerfile.sandbox -t wasm_sandbox .

# build a release binary
cargo build --release

#  Enable that binary to bind to port 80
sudo setcap 'cap_net_bind_service=+ep' target/release/Soroban-Playground

```

Restart server.

## Pruning Docker

After messing with different docker builds it can use a lot of HD

```bash
docker system prune -a
docker volume rm cargo-cache
docker volume create cargo-cache
docker build -f Dockerfile.sandbox -t wasm_sandbox .
```
## Crontab -e

```bash
@reboot echo "." > /tmp/project.wasm; chmod 666 /tmp/project.wasm
@reboot cd ~/Soroban-Playground; ~/Soroban-Playground/target/release/Soroban-Playground
0 1 * * * cd ~/Soroban-Playground; docker run --rm -v cargo-cache:/cache alpine sh -c "rm -rf /cache/target/debug /cache/target/tmp"
```

## 2 do
- Multifile support (tabs along top of editor)
- Research safe way to edit cargo.toml
- Split contracts and tests
- Improve contract explorer
- Export integration to HTML/JS
- CustomGPT Chatbot integration
- Rust linter
- More wallets supported (Creit-Tech Wallet Kit v2 will support vanilla js, issue & contact: https://github.com/jamesbachini/Soroban-Playground/issues/2)


## License

MIT


## Contributing

Yes please 💗♥️❤️