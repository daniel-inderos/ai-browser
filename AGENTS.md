# Repository Guidelines

This guide helps contributors work effectively on the AI Browser (Electron + OpenAI) project.

## Project Structure & Module Organization
- `src/index.js`: Electron main process, app/menu, IPC.
- `src/preload.js`: Safe bridge (contextIsolation) for renderer IPC.
- `src/index.html` / `src/index.css`: UI, tabs, navigation, chat sidebar.
- `src/newtab.html`: New‑tab AI interface.
- `src/openaiHelper.js`: OpenAI streaming (`gpt-4.1`) helper.
- Root configs: `package.json` (scripts), `forge.config.js` (Forge), `.env` (secrets, not committed).

## Build, Test, and Development Commands
- Install: `npm install` — install dependencies.
- Run (dev): `npm start` — Electron Forge with watch + reload.
- Package: `npm run package` — create unpacked app.
- Make (distributables): `npm run make` — platform installers/zip.
- Publish: `npm run publish` — Forge publish pipeline (if configured).
- Lint: `npm run lint` — currently a placeholder; see Style section.

## Coding Style & Naming Conventions
- JavaScript (CommonJS). Indent 2 spaces, single quotes, end with semicolons.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes. File names lower camel (e.g., `openaiHelper.js`).
- Renderer access via `preload.js` only; keep `contextIsolation: true`, `nodeIntegration: false` in new code.
- Prefer small, focused modules under `src/` (e.g., `src/featureName.js`).

## Testing Guidelines
- No automated tests configured yet. If adding tests:
  - Use `*.spec.js` naming and place under `tests/`.
  - Wire a `test` script in `package.json` (e.g., Playwright for UI smoke, or headless checks on helper modules).
  - Include basic coverage via your chosen runner; keep flakiness low for Electron.
- Manual smoke before PR: start app, open a tab, verify navigation, open AI chat, confirm streamed tokens arrive and no errors in DevTools.

## Commit & Pull Request Guidelines
- Commits: prefer Conventional Commits style, e.g., `feat(ui): add chat streaming pause` or `fix(main): guard missing API key`.
- PRs: include purpose, linked issues (e.g., `Closes #123`), screenshots/GIFs for UI changes, and manual test notes.
- Keep PRs small and focused; update README or this guide when behavior or commands change.

## Security & Configuration Tips
- Required env: `OPENAI_API_KEY` in `.env`. Never commit secrets or log full keys.
- Model/config changes: keep defaults in `openaiHelper.js`; allow overrides via env when practical.
- Maintain Electron security: avoid enabling `@electron/remote` on new windows; validate/normalize navigations and inputs.

