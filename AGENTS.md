# AGENTS.md

## Scope
These instructions apply to the `peer-cli` repo.

## Working Rules
- Treat `src/commands/registry.ts`, `src/mcp/cash.ts`, and `src/output/errors.ts` as runtime sources of truth. The files under `agents/` are their generated agent contracts.
- Do not hand-edit generated catalog files. Rebuild after changing command metadata.
- Prefer dry-run previews for write paths. Use the single `--yes` execution flag only when immediate broadcast is intended.
- Keep `peer mcp --profile read-only` as the default. The `cash` profile may prepare unsigned transactions but must never accept signer material, sign, or broadcast. Use `full` only for the complete operator surface.
- Keep `package.json`, `mcp.json`, `plugin.json`, `server.json`, and packaged skill versions aligned for a release.
- Stake and dispute-protection commands track the current `@zkp2p/sdk` names.
  Protection is scoped by `(escrow, depositId, paymentMethod)`, and a zero risk
  window means that payment method admits without stake.
- A prepared Peer Cash order can return several `accessPolicyPaymentMethods`.
  The host must finalize the deposit, then submit one
  `prepareAccessPolicy(depositId, paymentMethod)` transaction per returned
  method. Access restriction is separate from stake-backed protection.
- Do not log or print private keys, API keys, tokens, cookies, or other credential values. Persistent runtime files stay owner-only.
- Keep tests hermetic unless a test is explicitly marked E2E.
- `agents.peer.xyz` source lives in `zkp2p-clients/clients/agents`; this repo owns the executable runtime and generated contracts it documents.

## Validation
- Run `npm run check`.
- Run `npm run test:e2e` when you change networked flows or checkout behavior.
- Validate `skills/peer-cash` with the installed skill validator after skill edits.
