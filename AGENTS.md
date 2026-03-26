# AGENTS.md

## Scope
These instructions apply to the `peer-cli` repo.

## Working Rules
- Treat `src/commands/registry.ts`, the files under `src/commands/`, and `agents/tool-catalog.json` and `agents/error-catalog.json` as the source of truth for docs and MCP registration.
- Do not hand-edit generated catalog files. Rebuild after changing command metadata.
- Prefer dry-run previews for write paths. Use `--yes` or `--execute` only when immediate broadcast is intended.
- Keep `peer mcp` read-only by default. Use `--full` only when write tools are needed.
- Do not log or print private keys, API keys, or other credential values.
- Keep tests hermetic unless a test is explicitly marked E2E.

## Validation
- Run `npm run lint`.
- Run `npm run typecheck`.
- Run `npm run test:coverage`.
- Run `npm run test:e2e` when you change networked flows or checkout behavior.
