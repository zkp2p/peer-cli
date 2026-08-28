# Changelog

## 0.4.0

- Updated to `@zkp2p/sdk@0.12.2-rc.3` and `@zkp2p/cash@0.4.11-rc.3` for the
  current method-scoped dispute-protection and Peer Cash access-policy APIs.
- Replaced the retired chargeback-enabled read with
  `stake dispute-protection-enabled`, including the required payment-method
  hash, and updated matured-release calls to the current SDK names.
- Fixed `peer_cash_prepare_access_policy` to require and forward the exact
  payment method returned by `accessPolicyPaymentMethods`.
- Updated the packaged skill, agent instructions, and generated catalogs for
  the access-policy and Stake to Take cutovers.

## 0.3.0

- Added complete StakeVault and dispute-protection CLI families, including
  authoritative and indexed state, preview-first writes, and matured-intent
  release operations.
- Added IntentGuardian discovery, policy, live extension quotes, payer-funding
  reads, and preview-first intent extension.
- Expanded every MCP profile with Peer Cash fill analytics, cross-chain source
  discovery and quoting, Relay status, and buyer history while preserving the
  existing authority boundaries.
- Updated install examples to the signed v0.3.0 release artifact.

## 0.2.0

- Added a read-only Streamable HTTP transport with a Railway health endpoint.
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
