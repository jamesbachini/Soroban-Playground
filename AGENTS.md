# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the Rust server (Actix-web). Key modules: `src/main.rs` (app entry), `src/routes/` (HTTP handlers), `src/docker.rs` (sandbox integration), `src/models.rs` and `src/semaphore.rs`.
- `frontend/` is a static single-page app with no build step. `index.html` is the shell, `frontend/pages/` contains lazily inserted tab HTML, `frontend/js/` contains browser JavaScript, `frontend/style/` contains shared and tab-specific CSS, and `frontend/templates/` contains default contract files.
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
- Frontend JS/CSS uses 2-space indentation. Keep the shell bootstrap in `frontend/js/main.js`; put feature logic in the closest module such as `workspaces.js`, `academy.js`, `build-test.js`, `explore.js`, `network-settings.js`, or `wallet-deploy.js`.
- Keep shared CSS in `frontend/style/style.css`. Put significant feature-specific CSS in the matching file, such as `academy.css`, `ai.css`, `deploy.css`, `settings.css`, or `workspace.css`.
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

## Frontend Architecture
- The app remains a static SPA served by Actix from `./frontend`; do not add React, Vite, Webpack, or another build step unless explicitly requested.
- `frontend/index.html` should stay small: sidebar, editor shell, resizer, panel container, external script tags, and the `type="module"` bootstrap.
- `frontend/js/main.js` fetches HTML partials from `frontend/pages/`, inserts panels into `#panel-container`, moves `#academy-main-view` into the editor area, loads ordered legacy-compatible JS modules, and lazy-loads tab CSS.
- Tab markup belongs in `frontend/pages/<tab>.html`. Preserve existing element IDs because the JS modules bind to those IDs directly.
- JavaScript is split by responsibility:
  - `state.js`: shared globals, constants, wallet kit setup, Academy lesson metadata.
  - `workspaces.js`: workspace storage, file tree, editor tabs, imports/exports, MCP bridge helpers.
  - `academy.js`: Academy rendering, progress, video, lesson import, deployment verification.
  - `editor-init.js`: Monaco editor creation and editor resize wiring.
  - `console-utils.js`: contract name extraction, ANSI console rendering, analytics helpers.
  - `build-test.js`: compile, test, and Scout audit flows.
  - `explore.js`: contract explorer forms, spec parsing, method invocation.
  - `network-settings.js`: network selection, local network settings, sharing, workspace import helpers.
  - `wallet-deploy.js`: wallet actions, signing, and deploy transaction flow.
  - `app-init.js`: final boot wiring once partials and modules are loaded.
- CSS is split by scope:
  - `style/style.css`: theme variables, shell layout, shared controls, panels, buttons, console basics.
  - `style/workspace.css`: Create/workspace manager and file tree.
  - `style/settings.css`: Settings panel.
  - `style/ai.css`: AI assistant and MCP setup.
  - `style/deploy.css`: wallet toolbar, deploy panel, explore panel, method forms.
  - `style/academy.css`: Academy main view and bottom tools panel.
- Because panel HTML is fetched dynamically, verify frontend work through the server URL, for example `./target/debug/Soroban-Playground --port 8080`, not by opening `frontend/index.html` with `file://`.

## Academy Architecture
- The Academy is a frontend feature kept inside the existing static SPA. Its sidebar entry switches the editor area to `#academy-main-view` and opens `#academy-panel` for lesson tools; styling is scoped in `frontend/style/academy.css`; behavior lives in `frontend/js/academy.js`.
- Lesson metadata is defined in `ACADEMY_LESSONS` in `frontend/js/state.js`. A lesson should include a stable `id`, `title`, `githubUrl`, `preferredFile`, optional `videoId`, and `expectedMethods` for deployment verification.
- Academy progress is browser-local in `localStorage` under `soropg-academy-progress`. Current progress milestones are: video started, code imported, and deployment verified.
- Code import reuses the existing GitHub workspace importer. Prefer GitHub tree URLs for future lessons so the importer can load all relevant files into a workspace.
- Lesson action buttons should route learners into the existing Create, Test, Build, and Deploy panels instead of duplicating compile/test/deploy architecture inside Academy.
- Deployment completion for Lesson 1 verifies a Testnet contract id in the browser with Stellar SDK. Future deployment-based lessons should add the expected exported method names to `expectedMethods`; if a lesson needs stronger validation than interface checks, add a narrowly scoped verifier rather than changing the global deploy flow.
- To add a future lesson: add metadata to `ACADEMY_LESSONS`, add or render its curriculum/guide UI in the Academy main view and bottom panel, set a YouTube `videoId` when available, and add verification criteria that can be checked from the browser or through a small dedicated route.
