---
name: peer
description: "Read live data from Peer (formerly ZKP2P), the non-custodial peer-to-peer fiat<>crypto marketplace on Base, and cash out Base USDC to fiat. Use when: the agent needs fiat<>USDC quotes, orderbook or spread data, deposit and intent lookups, protocol volume stats, or wants to cash out USDC to a bank or payment app via Peer Cash. Reads need no credentials. Cash-outs prepare unsigned Base transactions that the agent's own wallet (e.g. via Bankr) signs and submits; the Peer CLI never touches keys. NOT for: buying crypto with fiat inside the terminal, or custodial exchange workflows."
metadata:
  openclaw:
    requires:
      bins:
        - node
        - npx
    notes: "All reads work with zero configuration over the hosted endpoint or the CLI. Write flows only prepare unsigned calldata; signing and submission stay with the agent's wallet."
---

# Peer

Peer is a peer-to-peer fiat<>crypto marketplace on Base: escrowed USDC deposits
filled by peers paying fiat, verified with payment proofs. No protocol fee; the
maker sets the spread.

## Read (no credentials)

CLI, JSON output by default:

```bash
npx -y peer-protocol-cli quote --from USD --amount 100 --platform wise
npx -y peer-protocol-cli market spreads
npx -y peer-protocol-cli market volume
```

Or connect the remote MCP (Streamable HTTP, no auth, 97 read-only tools):
`https://mcp.peer.xyz/mcp`

Exact command schemas: `npx -y peer-protocol-cli --help`, or the machine
catalogs shipped in the package (`agents/tool-catalog.json`).

## Cash out USDC to fiat (Peer Cash)

The cash profile prepares transactions and reads state; it never accepts a
private key, signs, or broadcasts.

1. `peer_cash_capabilities` then `peer_cash_estimate` (estimates are
   approximate; the binding rate resolves when a buyer fills).
2. `peer_cash_prepare` with the amount in 6-decimal base units (100 USDC is
   `100000000`). Returns ordered unsigned transactions `{ to, value, data }`,
   usually approve then `createDeposit`.
3. Present the exact plan and get explicit approval.
4. Sign and submit each transaction in order with the agent's Base wallet.
5. `peer_cash_finalize` with the confirmed `createDeposit` hash; persist the
   returned `depositId` and track fills with `peer_cash_order`.

Run the cash MCP locally:

```bash
npx -y peer-protocol-cli mcp --profile cash
```

## Safety

- Never request or handle a private key or seed phrase.
- Confirmed onchain transactions are irreversible; unmatched escrow funds can
  be withdrawn with `peer_cash_prepare_withdraw`.
- If it is unclear whether a mutation happened, stop and verify onchain before
  resubmitting.

Docs: https://agents.peer.xyz
