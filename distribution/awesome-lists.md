# Awesome-list PRs (five targets, one line each)

Rules below were read from each repo's live CONTRIBUTING/README on 2026-08-26.
Fork, branch, apply the exact edit, open the PR with the given title and body.

---

## 1. punkpeye/awesome-mcp-servers (92k+ stars, feeds Glama)

Rule: agent PRs are fast-tracked when the PR title ends with three robot emoji.
Edit README.md, Finance & Fintech section. New entries append at the end of the
section, directly before the `### 🎮 Gaming` heading.

Entry line (single line, verbatim):

```
- [zkp2p/peer-cli](https://github.com/zkp2p/peer-cli) [![zkp2p/peer-cli MCP server](https://glama.ai/mcp/servers/zkp2p/peer-cli/badges/score.svg)](https://glama.ai/mcp/servers/zkp2p/peer-cli) 🎖️ 📇 ☁️ 🏠 - Peer (formerly ZKP2P), the peer-to-peer fiat<>crypto marketplace on Base: live quotes, orderbook, spreads, deposits, intents, protocol stats, and Peer Cash cash-out data. 97 read-only tools, no auth, holds no keys. Remote Streamable HTTP at https://mcp.peer.xyz/mcp or `npx -y peer-protocol-cli mcp`.
```

PR title: `Add Peer MCP server (Finance & Fintech) 🤖🤖🤖`

PR body:

```
Adds Peer to Finance & Fintech.

Peer (formerly ZKP2P) is a peer-to-peer fiat<>crypto marketplace on Base. The MCP server exposes 97 read-only tools for live quotes, orderbook and spread data, deposits, intents, protocol stats, and Peer Cash cash-out data.

- Remote (Streamable HTTP, no auth): https://mcp.peer.xyz/mcp
- Local: `npx -y peer-protocol-cli mcp`
- Repo: https://github.com/zkp2p/peer-cli
- Docs: https://agents.peer.xyz

All 97 tools carry `readOnlyHint: true`; the server holds no keys and never signs or broadcasts.
```

---

## 2. jaw9c/awesome-remote-mcp-servers

Edit README.md, the `## Remote MCP Server List` table (starts line ~61).
Columns: Name | Category | URL | Authentication | Maintainer. Insert
alphabetically after the `Peek.com` row.

Row (verbatim):

```
| Peer | Payments | `https://mcp.peer.xyz/mcp` | Open | [Peer](https://peer.xyz) |
```

PR title: `Add Peer (Payments, open auth)`

PR body: one paragraph noting official maintenance by the Peer team, remote
Streamable HTTP, no auth, 97 read-only tools, repo zkp2p/peer-cli.

---

## 3. hive-intel/awesome-crypto-mcp-servers

Selective list, favors official registry presence: open this PR only after
issue #13 publishes `io.github.zkp2p/peer`. Edit README.md, section
`## DeFi, Markets, and Trading`, append after the last entry. Entries are
single dense bullets, official-status first.

Entry (verbatim):

```
- [Peer MCP Server](https://github.com/zkp2p/peer-cli) - Official MCP Registry-listed remote MCP from Peer (formerly ZKP2P), the non-custodial peer-to-peer fiat<>crypto marketplace on Base, for live fiat<>USDC quotes, orderbook and spread data, deposits, intents, protocol volume stats, and Peer Cash cash-out estimates; 97 read-only tools at `https://mcp.peer.xyz/mcp` with no auth, no keys, and no signing.
```

PR title: `Add Peer MCP Server to DeFi, Markets, and Trading`

Note: repo last pushed 2026-06-04; merge may be slow.

---

## 4. sodofi/awesome-onchain-agents

Edit README.md, `## MCP Servers` section. Format is a `###` sub-heading, one
sentence, then bold links. Append after the last MCP entry.

Block (verbatim):

```
### Peer MCP Server

Live quotes, orderbook, deposits, and protocol data from Peer (formerly ZKP2P), the peer-to-peer fiat<>crypto marketplace on Base. 97 read-only tools, remote endpoint with no auth.

**[Website](https://agents.peer.xyz)**
**[GitHub](https://github.com/zkp2p/peer-cli)**
```

PR title: `Add Peer MCP Server`

Note: repo last pushed 2026-03-05; merge may be slow.

---

## 5. royyannick/awesome-blockchain-mcps

Edit README.md, `## 💰 Crypto Payments MCPs` section. Format:
`- **[Name](url)** – description` (their separator is their house style; match
the file, do not normalize it). Append after the Base USDC Transfer MCP entry.

Entry (verbatim, keep their existing separator character):

```
- **[Peer MCP Server](https://github.com/zkp2p/peer-cli)** – Read-only access to **Peer (formerly ZKP2P)**, the peer-to-peer fiat<>crypto marketplace on Base: live fiat<>USDC quotes, orderbook data, deposits, intents, and protocol stats. Remote endpoint at `https://mcp.peer.xyz/mcp`, no auth, no keys.
```

PR title: `Add Peer MCP Server to Crypto Payments`

Note: repo last pushed 2026-03-17; merge may be slow.
