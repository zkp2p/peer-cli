---
title: "Peer Plugin"
description: "Cash out Base USDC to fiat on Peer's peer-to-peer marketplace: the local Peer cash MCP prepares unsigned transactions, submitted via send_calls."
tags: [payments, offramp, cash-out, agent-commerce]
name: peer
version: 0.1.0
integration: external-mcp
chains: [base]
requires:
  shell: required
  allowlist: []
  externalMcp:
    name: peer
    transport: stdio
    command: npx
    args: ["-y", "peer-protocol-cli@0.3.0", "mcp", "--profile", "cash"]
  cliPackage: null
auth: none
risk: [local-exec, irreversible]
---

> [!IMPORTANT]
> Complete Base MCP detection and onboarding (see `SKILL.md`) before any Peer call. Cash-outs need a funded Base USDC wallet from `get_wallets`.

## Overview

Peer (formerly ZKP2P) is a non-custodial peer-to-peer fiat<>crypto marketplace on Base. Users cash out USDC to their own fiat account (bank or payment app) by creating an escrowed deposit that peer buyers fill at the live oracle market rate. This plugin drives the Peer cash MCP profile, which reads protocol state and **prepares unsigned transactions only** - it never accepts a private key, signs, or broadcasts. Prepared `{ to, value, data }` plans land on Base MCP `send_calls`.

## Detection

If no `peer_cash_*` tools are exposed, the Peer cash MCP is not installed - see `## Installation`. Do not improvise HTTP calls against Peer infrastructure; the MCP is the supported path.

## Installation

Register the local MCP in the harness config (Claude Code, Codex, Cursor / JSON-config). Pinned version, no env vars required:

```json
{
  "mcpServers": {
    "peer": {
      "command": "npx",
      "args": ["-y", "peer-protocol-cli@0.3.0", "mcp", "--profile", "cash"]
    }
  }
}
```

Node.js 22+ is required. On chat-only surfaces (Claude.ai, ChatGPT) a local MCP cannot run - see `## Surface Routing`.

## Surface Routing

| Capability | Shell + MCP-config surface (Claude Code, Codex, Cursor) | Chat-only surface (Claude.ai, ChatGPT) |
|---|---|---|
| Read: capabilities, estimates, order status | Local Peer cash MCP tools | Remote read-only MCP connector at `https://mcp.peer.xyz/mcp` (Streamable HTTP, no auth), if the harness supports remote MCP; otherwise stop |
| Write: prepare cash-out, withdrawal, top-up | Local Peer cash MCP prepares; Base MCP `send_calls` submits | **Stop.** Tell the user cash-outs need a local install; do not improvise a `web_request` workaround |

## Orchestration

1. Call `peer_cash_capabilities`; never name a rail, currency, or amount from memory.
2. Call `peer_cash_estimate` for the cash-out amount. State that the estimate is approximate; the binding rate resolves when a buyer fills.
3. Get the depositor address from Base MCP `get_wallets`.
4. Call `peer_cash_prepare` with the Base USDC amount as a 6-decimal base-unit string (100 USDC is `100000000`) and the receive legs. It returns ordered unsigned transactions (`txs[]`, usually approve then `createDeposit`) with one label per transaction in `steps[]`, plus `accessPolicyRequired`.
5. Show the user the ordered plan - each destination, value, and purpose - and obtain explicit approval for that exact plan.
6. Submit via `send_calls` (see `## Submission`) and confirm the `createDeposit` receipt.
7. Call `peer_cash_finalize` with the confirmed transaction hash. If `accessPolicyRequired` is true, prepare, approve, and submit the access-policy transaction from the same depositor wallet.
8. Persist the returned `depositId`; use `peer_cash_order` to track fills and resume.

### Withdrawals and top-ups

`peer_cash_prepare_withdraw` (omit amount to close the order; pass a base-unit amount for partial) and `peer_cash_prepare_top_up` return the same ordered unsigned plans. Apply the same approval and confirmation rules.

## Submission

Target tool: `send_calls`. Each prepared transaction is `{ to, data, value, chainId }`; map fields 1:1 into the `calls` array, preserving order (approval before `createDeposit`), with `chain: "base"`:

```json
{
  "chain": "base",
  "calls": [
    { "to": "<txs[0].to>", "value": "<txs[0].value>", "data": "<txs[0].data>" },
    { "to": "<txs[1].to>", "value": "<txs[1].value>", "data": "<txs[1].data>" }
  ]
}
```

`value` is usually `0`. Follow the approval/polling flow in [approval-mode.md](../references/approval-mode.md); never claim success before `get_request_status` confirms. After confirmation, pass the `createDeposit` transaction hash to `peer_cash_finalize`.

## Example Prompts

**"Cash out 200 USDC to my bank account with Peer"**
1. `peer_cash_capabilities`, then `peer_cash_estimate` for 200 USDC on the user's rail.
2. `get_wallets` for the depositor address; `peer_cash_prepare` with amount `200000000`.
3. Present the ordered plan; on approval, `send_calls`, await confirmation, `peer_cash_finalize` with the tx hash, persist `depositId`.

**"What rate would I get cashing out 50 USDC right now?"**
1. `peer_cash_capabilities`, then `peer_cash_estimate`; report the estimate as approximate until a buyer fills. Read-only, nothing to submit.

**"Has my Peer cash-out filled yet?"**
1. `peer_cash_order` with the stored `depositId`; report fill status and remaining balance. On chat-only surfaces this read also works over the remote endpoint.

**"Close my open Peer order and withdraw the rest"**
1. `peer_cash_prepare_withdraw` with the order id and no amount; present the plan, submit via `send_calls` on approval.

## Risks & Warnings

- **local-exec**: this plugin runs the `peer-protocol-cli` npm package on the user's machine as a local MCP server. The version is pinned; bump it only in a tracked change. Confirm the user accepts installing third-party code.
- **irreversible**: `createDeposit` moves USDC into protocol escrow onchain. Unmatched funds can be withdrawn with a prepared withdrawal, but confirmed transactions cannot be undone; never submit without explicit approval of the exact plan. The fiat leg settles at fill time and the binding rate can differ from the estimate; never present the estimate as guaranteed. If evidence cannot prove whether a mutation occurred, stop and require wallet or block-explorer confirmation.
- Never request or handle a private key or seed phrase; the Peer MCP never accepts one.

## Notes

- Remote read-only MCP (97 tools, no auth): `https://mcp.peer.xyz/mcp`. The cash profile's `prepare` tools are local-only by design.
- Amounts are 6-decimal USDC base units everywhere.
- Recovery: retry `ORDER_NOT_FOUND` only as a read (indexer lag after finalize); for `TRANSACTION_SUBMISSION_UNKNOWN` inspect the named hash and existing orders before any resubmission; `ACCESS_POLICY_CONFIGURATION_FAILED` means the deposit exists and only the policy step needs repair.
- Docs: https://agents.peer.xyz - repo: https://github.com/zkp2p/peer-cli - npm: `peer-protocol-cli`.
