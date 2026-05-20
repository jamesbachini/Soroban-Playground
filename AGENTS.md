# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Rust server (Actix-web). Key modules: `src/main.rs` (app entry), `src/routes/` (HTTP handlers), `src/docker.rs` (sandbox integration), `src/models.rs` and `src/semaphore.rs`.
- `frontend/` is a static single-page app: `index.html`, `main.js`, `style.css`, plus `templates/` for default contract files.
- `Dockerfile.sandbox` defines the `wasm_sandbox` image used to compile/test contracts.
- Root files like `Cargo.toml` and `Cargo.lock` track Rust dependencies.

## Build, Test, and Development Commands
- `cargo build --release` builds the production binary.
- `sudo setcap 'cap_net_bind_service=+ep' target/release/Soroban-Playground` allows binding to port 80 without running as root.
- `./target/release/Soroban-Playground --port 80` runs the server (omit `--port` for default 80).
- `docker volume create cargo-cache` creates the shared build cache volume.
- `docker build -f Dockerfile.sandbox -t wasm_sandbox .` builds the sandbox image.
- `docker system prune -a` cleans Docker images/containers when the cache gets bloated.

## Coding Style & Naming Conventions
- Rust code uses standard formatting (4-space indentation, `snake_case` for functions/modules). Keep route handlers in `src/routes/*.rs` and wire them in `src/main.rs`.
- Frontend JS/CSS uses 2-space indentation. Keep UI logic in `frontend/main.js` and styles in `frontend/style.css`.
- Template files are fixed-name defaults in `frontend/templates/` (`Cargo.toml`, `lib.rs`, `test.rs`).

## Testing Guidelines
- There are no automated Rust unit tests in this repo.
- Contract tests live in `frontend/templates/test.rs` and are executed in the Docker sandbox via the `/test` endpoint.
- For manual verification: run the server, open the UI, compile a contract, and run tests from the editor.

## Commit & Pull Request Guidelines
- Commit history favors short, direct messages (e.g., “Update dependencies”, “Fix for …”, “version in cargo.toml”). Avoid long paragraphs or prefixes.
- PRs should include: a brief summary, local run instructions, and notes on any Docker or sandbox changes. Add UI screenshots when frontend behavior changes.

## Security & Configuration Tips
- Docker is required; the app uses the `wasm_sandbox` image and `cargo-cache` volume for isolated builds.
- If you can’t bind to port 80, run with `--port 8080` or apply `setcap` as shown above.

## Academy Architecture
- The Academy is a low-traffic frontend feature kept inside the existing static SPA. Its sidebar entry switches the editor area to `#academy-main-view` and opens `#academy-panel` for lesson tools; styling is scoped in `frontend/style.css`; behavior lives in `frontend/main.js`.
- Lesson metadata is defined in `ACADEMY_LESSONS` in `frontend/main.js`. A lesson should include a stable `id`, `title`, `githubUrl`, `preferredFile`, optional `videoId`, and `expectedMethods` for deployment verification.
- Academy progress is browser-local in `localStorage` under `soropg-academy-progress`. Current progress milestones are: video started, code imported, and deployment verified.
- Code import reuses the existing GitHub workspace importer. Prefer GitHub tree URLs for future lessons so the importer can load all relevant files into a workspace.
- Lesson action buttons should route learners into the existing Create, Test, Build, and Deploy panels instead of duplicating compile/test/deploy architecture inside Academy.
- Deployment completion for Lesson 1 verifies a Testnet contract id in the browser with Stellar SDK. Future deployment-based lessons should add the expected exported method names to `expectedMethods`; if a lesson needs stronger validation than interface checks, add a narrowly scoped verifier rather than changing the global deploy flow.
- To add a future lesson: add metadata to `ACADEMY_LESSONS`, add or render its curriculum/guide UI in the Academy main view and bottom panel, set a YouTube `videoId` when available, and add verification criteria that can be checked from the browser or through a small dedicated route.
