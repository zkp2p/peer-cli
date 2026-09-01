# Changelog

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
