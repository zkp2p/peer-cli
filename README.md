# @peer/cli

`peer-cli` is the JSON-first CLI and MCP wrapper for the Peer (ZKP2P) protocol. It shares one command registry across the CLI, MCP tools, and generated agent catalogs, so the runtime surface and the docs stay aligned.

It can:
- Quote fiat to USDC.
- Manage deposits, intents, vaults, delegation, and oracle configuration.
- Query the indexer, ProtocolViewer, Peerlytics market data, and Pay checkout sessions.
- Run as an MCP server over stdio for agent workflows.

## Setup

### Requirements
- Node.js 18 or newer
- npm
- Wallet material and API keys for write commands

### Install and build

```bash
npm install
npm run build
```

`npm run build` regenerates `agents/tool-catalog.json` and `agents/error-catalog.json` before bundling the CLI into `dist/`.

### Run from source

```bash
npm run dev -- quote --from USD --amount 100 --platform wise
```

### Helpful wrappers

- `scripts/build.sh` wraps `npm run build`
- `scripts/test-staging.sh` wraps `npm run test:e2e`

## Configuration

`peer-cli` resolves configuration in this order:
1. CLI flags
2. Environment variables
3. Stored config in `~/.peer/config.json`
4. Built-in defaults

### Global flags

| Flag | Purpose |
| --- | --- |
| `--env <production|preproduction|staging>` | Select the runtime environment. |
| `--private-key <hex>` | Provide a hex private key directly. Warning: visible in process listings; prefer `PEER_PRIVATE_KEY`. |
| `--wallet-path <path>` | Read a private key from a file. |
| `--rpc-url <url>` | Override the Base RPC URL. |
| `--api-key <value>` | Curator API key for SDK-backed authenticated routes. |
| `--indexer-key <value>` | Indexer API key. |
| `--indexer-url <url>` | Indexer base URL override. |
| `--market-api-key <value>` | Peerlytics API key. |
| `--pay-api-key <value>` | Pay API key. |
| `--base-api-url <url>` | Base API URL override. |
| `--market-base-url <url>` | Peerlytics base URL override. |
| `--pay-base-url <url>` | Pay API base URL override. |
| `--format <json|table>` | Choose JSON or table output for successful CLI commands. |
| `--yes` | Skip the preview step and execute prepared writes immediately. |
| `--execute` | Alias for `--yes`. |
| `--debug` | Emit verbose debug logs to stderr. |

### Environment variables

| Variable | Purpose |
| --- | --- |
| `PEER_ENV` | Runtime environment. |
| `PEER_PRIVATE_KEY` | Hex private key. |
| `PEER_WALLET_PATH` | Path to a file containing a private key. |
| `PEER_RPC_URL` | Base RPC URL override. |
| `PEER_API_KEY` | Curator API key. |
| `PEER_INDEXER_API_KEY` | Indexer API key. |
| `PEER_INDEXER_URL` | Indexer base URL override. |
| `PEER_MARKET_API_KEY` | Peerlytics API key. |
| `PEER_PAY_API_KEY` | Pay API key. |
| `PEER_BASE_API_URL` | Base API URL override. |
| `PEER_MARKET_BASE_URL` | Peerlytics base URL override. |
| `PEER_PAY_BASE_URL` | Pay API base URL override. |

### Stored config

The persistent config file lives at `~/.peer/config.json`. The checkout cache is stored at `~/.peer/checkout-sessions.json`.

Use `peer config set` to update stored values. Supported keys include `env`, `walletPath`, `apiKey`, `marketApiKey`, `payApiKey`, `rpcUrl`, `indexerUrl`, and `indexerKey`, plus their common dashed aliases.

### Common config commands

```bash
peer config show
peer config set env staging
peer config set walletPath /path/to/wallet.txt
peer config set payApiKey $PEER_PAY_API_KEY
```

## Command Model

The general shape is:

```bash
peer [global flags] <command> [command flags]
```

Read commands return structured data immediately. Write commands prepare a transaction or API action and preview the result first. Add `--yes` or `--execute` to broadcast prepared writes immediately.

Typed flags are merged over `--params` or `--params-file`, so explicit flags win when both are present.

Commands that need a signer require one of:
- `--private-key`
- `PEER_PRIVATE_KEY`
- `walletPath` in `~/.peer/config.json`

## Command Reference

### Quotes and payee helpers
- `peer quote` - Get fiat-to-USDC exchange quotes.
- `peer taker tier` - Fetch taker caps and cooldown state.
- `peer payee register` - Register payee details with the curator API.
- `peer payee resolve-hash` - Resolve a payee hash from on-chain deposit data.

### Deposits
- `peer deposit ensure-allowance`
- `peer deposit create`
- `peer deposit list`
- `peer deposit show`
- `peer deposit show-many`
- `peer deposit add-funds`
- `peer deposit remove-funds`
- `peer deposit withdraw`
- `peer deposit pause`
- `peer deposit resume`
- `peer deposit set-range`
- `peer deposit set-rate`
- `peer deposit set-retain-on-empty`
- `peer deposit set-delegate`
- `peer deposit remove-delegate`
- `peer deposit payment-method add`
- `peer deposit payment-method set-active`
- `peer deposit payment-method remove`
- `peer deposit currency add`
- `peer deposit currency deactivate`
- `peer deposit currency remove`
- `peer deposit prune-intents`
- `peer deposit oracle set`
- `peer deposit oracle remove`
- `peer deposit oracle set-batch`
- `peer deposit currency-config update-batch`
- `peer deposit currency deactivate-batch`

### ProtocolViewer and indexer reads
- `peer pv deposit show`
- `peer pv deposit show-many`
- `peer pv deposit list-owner`
- `peer indexer deposits list`
- `peer indexer deposits list-relations`
- `peer indexer deposits show`
- `peer indexer deposits by-ids`
- `peer indexer deposits by-ids-relations`
- `peer indexer deposits fund-activities`
- `peer indexer makers fund-activities`
- `peer indexer deposits snapshots`
- `peer indexer query` - Raw GraphQL passthrough; use sparingly.
- `peer indexer intents by-deposit-ids`
- `peer indexer intents by-owner`
- `peer indexer intents show`
- `peer indexer intents expired`
- `peer indexer intents fulfilled-events`
- `peer indexer intents fulfillment-amounts`
- `peer indexer intents fulfillment-and-payment`
- `peer indexer delegations by-deposit`

### Intents and hooks
- `peer intent create`
- `peer intent list`
- `peer intent show`
- `peer intent cancel`
- `peer intent fulfill`
- `peer intent release`
- `peer intent fulfill-inputs`
- `peer intent cleanup-orphaned`
- `peer intent-hook pre set`
- `peer intent-hook pre get`
- `peer intent-hook whitelist set`
- `peer intent-hook whitelist get`

### Vaults, oracle, and delegation
- `peer vault create`
- `peer vault list`
- `peer vault show`
- `peer vault set-rate`
- `peer vault set-rates`
- `peer vault set-fee`
- `peer vault set-config`
- `peer vault delegates`
- `peer vault snapshots`
- `peer vault manual-rate-updates`
- `peer vault oracle-config-updates`
- `peer vault manager-fee`
- `peer vault effective-rate`
- `peer oracle supports-inline`
- `peer oracle validate-feeds`
- `peer delegate set`
- `peer undelegate`
- `peer delegate show`
- `peer delegate set-direct`
- `peer delegate clear-direct`

### Market and transfer tools
- `peer market spreads`
- `peer market compare`
- `peer market volume`
- `peer market leaderboard`
- `peer market protocol-stats`
- `peer transfer`
- `peer balance`

### Checkout and config
- `peer checkout create` - Previews the Pay API request and only creates the session with `--yes`.
- `peer checkout list`
- `peer checkout show`
- `peer checkout cancel` - Previews the cancel action and only executes with `--yes`.
- `peer config show`
- `peer config set`
- `peer config platforms`
- `peer config currencies`

### MCP
- `peer mcp`

See `agents/tool-catalog.json` for the exact generated input schemas and read/write flags.

## MCP

`peer mcp` starts the MCP server over stdio with the server name `peer-cli`.

- By default it exposes read-only tools only.
- Pass `--full` to include write-capable tools.
- Pass `--read-only` to force read-only registration even if `--full` is present.

The generated tool catalog lives in `agents/tool-catalog.json` and is derived from the same command registry as the CLI.

Example:

```bash
peer mcp --read-only
peer mcp --full
```

## Output and Errors

CLI commands return a JSON envelope by default:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "command": "peer quote",
    "env": "production",
    "chain": "base",
    "timestamp": "2026-03-26T00:00:00.000Z",
    "duration_ms": 12
  }
}
```

Failures use the same envelope shape with `ok: false` and an error body:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "category": "validation",
    "message": "Either --amount or --token-amount is required.",
    "retryable": false,
    "suggestion": "Inspect the command arguments and re-run with valid values."
  },
  "meta": {
    "command": "peer quote",
    "env": "production",
    "chain": "base",
    "timestamp": "2026-03-26T00:00:00.000Z",
    "duration_ms": 8
  }
}
```

### Output formats
- `--format json` prints the JSON envelope unchanged.
- `--format table` renders successful objects and arrays as text tables.
- Errors still emit JSON to stderr, even when `--format table` is selected.

### Error fields
- `code`
- `category`
- `message`
- `retryable`
- `suggestion`
- `details`

Common error categories include validation, auth, config, network, rate_limit, contract, timeout, unsupported, api, and internal.

### Debug logging

Enable `--debug` to print prefixed diagnostics to stderr:

```text
[peer-cli] message {"details":"..."}
```

## Testing

Run the repo checks before handoff:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
```

Run end-to-end coverage when you touch networked flows or command wiring that depends on live services:

```bash
npm run test:e2e
```

## Examples

Quote a swap in table form:

```bash
npm run dev -- quote --from USD --amount 150 --platform wise --format table
```

Preview a deposit creation before broadcasting:

```bash
npm run dev -- deposit create \
  --amount 250 \
  --min 50 \
  --max 250 \
  --platforms wise,venmo \
  --currencies USD,EUR \
  --rate 1.02
```

Execute a prepared write immediately:

```bash
npm run dev -- deposit create --amount 250 --min 50 --max 250 --platforms wise --currencies USD --rate 1.02 --yes
```

Create a Pay checkout session and cache it locally:

```bash
npm run dev -- checkout create --amount 25 --currency USD --description "Test order"
```

Run the MCP server in read-only mode:

```bash
npm run dev -- mcp --read-only
```
