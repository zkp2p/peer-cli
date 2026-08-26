Target: new issue on cline/mcp-marketplace using template `mcp-server-submission.yml`
(https://github.com/cline/mcp-marketplace/issues/new?template=mcp-server-submission.yml)

Title: `Add Peer MCP server (zkp2p/peer-cli)`

Body:

---

**GitHub Repo URL:** https://github.com/zkp2p/peer-cli

**Logo Image:** https://peer.xyz/logo512.png (512x512 PNG; resize to 400x400 if strict)

**Reason for Addition:**

Peer (formerly ZKP2P) is a non-custodial peer-to-peer fiat<>crypto marketplace on Base. The MCP server gives Cline users live fiat<>USDC quotes across payment platforms, orderbook and spread data, deposit and intent lookups, protocol volume stats, and Peer Cash cash-out estimates - 97 tools, all read-only (`readOnlyHint: true`), no API key, no wallet, no signing. Zero-setup remote endpoint (Streamable HTTP): `https://mcp.peer.xyz/mcp`. Local alternative: `npx -y peer-protocol-cli mcp`. MIT licensed, maintained by the Peer team.

Setup was tested by giving the agent only the repo README: the remote endpoint needs a single MCP config entry with no credentials, and the local path is one npx command.

---

Note before filing: their process asks that you have watched Cline set the
server up from the README alone. Run that check once in Cline first, honestly,
before submitting. Expect extra scrutiny on crypto servers; read-only/no-key
design is the counterargument.
