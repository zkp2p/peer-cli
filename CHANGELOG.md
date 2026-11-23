# Changelog

## Unreleased

- Run the Peer Cash MCP tools on `peer.sell` from `@zkp2p/sdk` 0.16.0-rc.1.
  Relay source tools (`peer_cash_source_capabilities`, `peer_cash_quote_source`,
  `peer_cash_relay_status`) stay on `@zkp2p/cash`, which the SDK does not
  replace for source routing.
- Remove `peer_cash_prepare_access_policy` and the `includeRelaySources`
  argument of `peer_cash_capabilities`. `PeerCashMcpConfig.client` is now a
  `PeerSell`; inject Relay source routing through `sourceClient`.
- Every Cash corridor binds the oracle rate when a buyer signals an intent.
  Unknown payee handles fail with `PAYEE_NOT_FOUND` (not retryable).
- Accept Monobank, which the SDK 0.16 payment-method catalog adds.

## 0.4.1

- Adopt Peer Cash 0.6.1 and SDK 0.14.2, which ship optional Venmo receipt
  linking and read UPI/INR creation rates from Polygon Chainlink.
- Accept UPI/INR in production and preproduction as well as staging, matching
  the SDK payment-method catalog now that the Amazon Pay UPI flow is live.

## 0.4.0

- Add staging-only UPI platform discovery, quotes, maker registration and
  deposit/intent previews. Production and preproduction continue rejecting UPI.
- Adopt Peer Cash 0.5.3 and SDK 0.14.1 with stable contracts 0.4.1,
  including the current Cash App readiness risk window.
- Pin the packaged MCP launcher to the matching CLI release.
- Update the MCP transport’s Hono and qs dependencies to resolve current
  production dependency audit findings.

## 0.3.1

- Made free-form MCP inputs emit explicit recursive JSON schemas so strict MCP
  clients no longer report portability warnings.
- Added a GitHub OIDC publishing path for the official MCP Registry entry.

## 0.3.0

- Added complete StakeVault and chargeback-protection CLI families, including
  authoritative and indexed state, preview-first writes, and matured-intent
  release operations.
- Added IntentGuardian discovery, policy, live extension quotes, payer-funding
  reads, and preview-first intent extension.
- Expanded every MCP profile with Peer Cash fill analytics, cross-chain source
  discovery and quoting, Relay status, and buyer history while preserving the
  existing authority boundaries.
- Updated install examples to the signed v0.3.0 release artifact.

## 0.2.0

- Added a read-only Streamable HTTP transport with a health endpoint.
- Added the official MCP Registry manifest for local stdio and hosted HTTP use.
- Fixed preproduction and staging so they use their matching Curator APIs by
  default instead of silently querying production.

## 0.1.2

- Fixed version discovery when the installed `peer` binary is invoked through
  npm's symlink from outside the package directory.

## 0.1.1

- Fixed the installed `peer` binary so npm-created symlinks execute the CLI.
- Switched packaged install references to the public npm release.

## 0.1.0

- Consolidated the standalone Peer Cash MCP server, portable skill, and plugin
  manifests into `peer-cli`.
- Added explicit `read-only`, `cash`, and `full` MCP profiles. The MCP launcher
  is no longer exposed recursively as a tool.
- Added a generated runtime manifest, a public library entry point, owner-only
  local state, broader debug redaction, and a zero-advisory dependency tree.
- Removed the retired `--execute` alias; `--yes` is the single execution flag.
- Moved the `agents.peer.xyz` documentation application to
  `zkp2p-clients/clients/agents`.
- Shipped the initial `peer-cli` implementation.
