# peer-cli

## Commands
- `npm run dev -- <args>` to run the CLI from source.
- `npm run build` to regenerate the agent catalogs and bundle the binary.
- `npm run lint` to check code and scripts.
- `npm run typecheck` to run the TypeScript compiler without emitting output.
- `npm run test:coverage` to enforce coverage thresholds.

## Notes
- The command registry in `src/commands/registry.ts` is the source of truth for CLI, MCP, and generated catalogs.
- `peer mcp` is read-only by default. Pass `--full` to expose write tools and `--read-only` to force the read-only surface.
- `--yes` and `--execute` both force prepared write commands to broadcast immediately.
- Persistent config lives at `~/.peer/config.json`; checkout cache lives at `~/.peer/checkout-sessions.json`.
- `--format table` only changes successful CLI rendering. Errors always emit JSON to stderr.
