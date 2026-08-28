# peer-cli

## Commands
- `npm run dev -- <args>` to run the CLI from source.
- `npm run build` to regenerate the agent catalogs and bundle the binary.
- `npm run lint` to check code and scripts.
- `npm run typecheck` to run the TypeScript compiler without emitting output.
- `npm run test:coverage` to enforce coverage thresholds.
- `npm run check` to run the complete publish gate.

## Notes
- The command registry, `src/mcp/cash.ts`, and the error catalog are runtime sources of truth. `npm run build` regenerates the agent contracts.
- `peer mcp --profile read-only` is the default. `cash` exposes custody-separated Peer Cash tools; `full` exposes every tool.
- `--yes` is the only flag that forces prepared generic writes to broadcast.
- Dispute protection is payment-method scoped. Use the current SDK method names,
  and pass the payment method hash to protection reads and Cash access-policy
  follow-ups.
- Persistent config lives at `~/.peer/config.json`; checkout cache lives at `~/.peer/checkout-sessions.json`.
- Persistent runtime files must remain owner-only, and debug output must redact secrets.
- `--format table` only changes successful CLI rendering. Errors always emit JSON to stderr.
- The `agents.peer.xyz` application is maintained in `zkp2p-clients/clients/agents`, not this repository.
