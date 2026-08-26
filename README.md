<!-- mcp-name: io.github.zkp2p/peer -->

# peer-cli

The canonical agent interface for Peer: one JSON-first CLI, local and hosted MCP
servers, and one generated contract for protocol, indexer, market, checkout,
and Peer Cash workflows.

- Docs and agent-readable text: <https://agents.peer.xyz>
- Exact CLI schemas: [`agents/tool-catalog.json`](agents/tool-catalog.json)
- Error contract: [`agents/error-catalog.json`](agents/error-catalog.json)
- Runtime profiles and counts:
  [`agents/runtime-manifest.json`](agents/runtime-manifest.json)

The generated files come from the runtime registries. Do not hand-maintain a
second command list in documentation.

## Install

Node.js 22 or newer is required.

The package is `peer-protocol-cli`; do not install the unrelated unscoped
`peer-cli` package.

```bash
npm install --global https://github.com/zkp2p/peer-cli/releases/download/v0.3.0/peer-protocol-cli-0.3.0.tgz
peer --help
```

Run without a global install:

```bash
npx -y https://github.com/zkp2p/peer-cli/releases/download/v0.3.0/peer-protocol-cli-0.3.0.tgz quote --from USD --amount 100 --platform wise
```

Successful output is JSON by default. Errors always use the canonical JSON
error envelope on stderr. `--format table` changes successful human-facing
output only.

## Safety model

Read commands execute immediately. Commands that can mutate state return a
transaction or API preview first and execute only when the process receives
`--yes`.

Signer material resolves from `PEER_PRIVATE_KEY` or `--wallet-path`. Passing a
private key on the command line is supported but visible in process listings;
prefer the environment or an owner-readable wallet file. Persistent config and
checkout caches are written with owner-only permissions.

Never start a write-capable MCP process with `--yes` unless every write tool in
that process is intentionally allowed to broadcast without a second CLI
preview.

## MCP profiles

`peer mcp` requires one of three explicit profiles:

- `read-only` — default protocol reads plus Peer Cash reads. No signing or
  broadcasting.
- `cash` — the complete custody-separated `peer_cash_*` surface. It prepares
  unsigned transaction plans but never accepts a private key, signs, or
  broadcasts.
- `full` — every generic CLI-backed MCP tool plus Peer Cash. Generic write tools
  still preview unless the MCP process was started with global `--yes`.

The current tool counts are generated in `agents/runtime-manifest.json`.

```json
{
  "mcpServers": {
    "peer": {
      "command": "npx",
      "args": [
        "-y",
        "https://github.com/zkp2p/peer-cli/releases/download/v0.3.0/peer-protocol-cli-0.3.0.tgz",
        "mcp",
        "--profile",
        "read-only"
      ]
    }
  }
}
```

Use `--profile cash` for the portable Peer Cash workflow or `--profile full`
for the complete operator surface.

The hosted MCP server exposes only the `read-only` profile over Streamable HTTP:

```text
https://mcp.peer.xyz/mcp
```

Run the same transport yourself with `peer mcp --transport http`. HTTP refuses
the `cash` and `full` profiles; those authority-bearing profiles remain local
stdio processes.

## Peer Cash

The retired standalone `peer-cash-mcp` server now lives here. Its tool names and
custody boundary are unchanged:

1. `peer_cash_capabilities` / `peer_cash_source_capabilities` — fetch live
   payout rails and Relay-supported source chains and tokens.
2. `peer_cash_fill_stats` / `peer_cash_buyer` — inspect historical fill
   evidence and buyer protocol history.
3. `peer_cash_quote_source` / `peer_cash_relay_status` — quote and track a
   cross-chain route into Base USDC without granting signer authority.
4. `peer_cash_estimate` — estimate fiat received at the current oracle rate.
5. `peer_cash_prepare` — return ordered unsigned approval and deposit
   transactions.
6. `peer_cash_finalize` — resolve a confirmed receipt into a durable
   `depositId`.
7. `peer_cash_order` / `peer_cash_orders` — resume and inspect orders.
8. `peer_cash_prepare_access_policy`, `peer_cash_prepare_withdraw`, and
   `peer_cash_prepare_top_up` — prepare follow-up transactions.

Base USDC amounts are decimal strings in 6-decimal base units: 100 USDC is
`100000000`. Estimates are not locked quotes; the binding Chainlink rate
resolves when a buyer fills.

Install the packaged portable skill from
[`skills/peer-cash/SKILL.md`](skills/peer-cash/SKILL.md) when the agent host
supports Agent Skills.

## Configuration

Configuration resolves in this order:

1. CLI flags
2. environment variables
3. `~/.peer/config.json`
4. runtime defaults

Common settings:

- `PEER_ENV`: `production`, `preproduction`, or `staging`
- `PEER_PRIVATE_KEY` / `PEER_WALLET_PATH`: signer material for generic write
  commands
- `PEER_RPC_URL`: Base RPC override
- `PEER_API_KEY`: Curator API key when required
- `PEER_INDEXER_API_KEY` / `PEER_INDEXER_URL`: indexer overrides
- `PEER_MARKET_API_KEY` / `PEER_MARKET_BASE_URL`: Peerlytics access
- `PEER_PAY_API_KEY` / `PEER_PAY_BASE_URL`: hosted checkout access
- `PEER_BASE_API_URL`: Curator override. Defaults follow `PEER_ENV`:
  `api.zkp2p.xyz`, `api-preprod.zkp2p.xyz`, or `api-staging.zkp2p.xyz`.
- `PEER_CASH_RPC_URL`, `PEER_CASH_API_KEY`, `PEER_CASH_REFERRAL_CODE`, and
  `PEER_CASH_REFERRER`: cash-profile overrides

Use `peer config show`, `set`, `unset`, and `reset` for persistent local
settings. `peer config show` masks secret values. Prefer environment variables
for credentials.

## Command families

The CLI covers:

- quotes, payee registration, and payee-hash resolution
- deposit lifecycle, payment methods, currencies, oracle configuration, and
  batch updates
- intents, pre-intent hooks, fulfillment, release, and cleanup
- StakeVault deposits, withdrawals, authorization, indexed freshness, and
  matured chargeback releases
- IntentGuardian policy, live extension quotes, payer funding, and
  preview-first intent extension
- ProtocolViewer and indexer reads, including a raw GraphQL escape hatch
- vaults, rate managers, delegation, fees, and snapshots
- Peerlytics market, explorer, history, attribution, and API-key operations
- USDC balances and transfers
- hosted checkout creation, reads, cancellation, and local resume cache
- local config and environment inspection

Run `peer --help`, `peer <family> --help`, or inspect the generated tool catalog
for the exact current paths, flags, schemas, auth requirements, and danger
markers.

Every command also accepts `--params <json>` and `--params-file <path>`. Typed
flags override raw values.

## Development

This repository uses npm and its committed `package-lock.json`.

```bash
npm install
npm run dev -- quote --from USD --amount 100 --platform wise
npm run check
```

`npm run build` regenerates all agent catalogs before bundling `peer` and the
public MCP library entry point. Run `npm run test:e2e` after changing networked
flows or checkout behavior.

The documentation application for `agents.peer.xyz` is owned by
`zkp2p/zkp2p-clients` at `clients/agents`; this repository owns the executable
runtime, package manifests, portable skill, and generated contracts it
documents.
