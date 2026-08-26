### Server name

zkp2p/peer-cli

### Project URL

https://github.com/zkp2p/peer-cli

### Best category

Other / not sure

### What can an agent do with this server?

Read live data from Peer (formerly ZKP2P), a peer-to-peer fiat<>crypto marketplace on Base: quotes for fiat<>USDC trades, orderbook and spread data, deposits, intents, protocol volume stats, and Peer Cash cash-out data. 97 tools, all read-only (`readOnlyHint: true`); the server holds no keys and never signs or broadcasts.

### Install or connection instructions

Remote (Streamable HTTP, no auth): https://mcp.peer.xyz/mcp
Local: `npx -y peer-protocol-cli mcp`
Docs: https://agents.peer.xyz

### Transport

streamable-http

### Auth requirements

no auth

### Known supported clients

Claude Desktop, Claude Code, Cursor, Codex, VS Code

### License

MIT

### Before submitting

- [x] I searched the repo for this project URL or name to avoid duplicates.

---

Target: new issue on TensorBlock/awesome-mcp-servers using the "Add MCP server" template (label `server-submission`).
Title: `Add MCP server: Peer (zkp2p/peer-cli)`
Duplicate check ran 2026-08-26: no existing zkp2p/peer/mcp.peer.xyz entry.
