# Changelog

## Unreleased

- Consolidated the standalone Peer Cash MCP server, portable skill, and plugin
  manifests into `peer-cli`.
- Added explicit `read-only`, `cash`, and `full` MCP profiles. The MCP launcher
  is no longer exposed recursively as a tool.
- Added a generated runtime manifest, a public library entry point, owner-only
  local state, broader debug redaction, and a zero-advisory dependency tree.
- Removed the retired `--execute` alias; `--yes` is the single execution flag.
- Moved the `agents.peer.xyz` documentation application to
  `zkp2p-clients/clients/agents`.

## 0.1.0

- Initial `peer-cli` implementation.
