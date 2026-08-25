---
name: peer-cash
description: Cash out Base USDC to fiat with custody-separated Peer MCP tools. Use for live payout capabilities, estimates, unsigned transaction plans, order tracking, withdrawals, top-ups, or uncertain-outcome recovery.
---

# Peer Cash

Use the `peer_cash_*` tools from `zkp2p/peer-cli`. The cash profile prepares
transactions and reads protocol state; it never accepts private keys, signs, or
broadcasts.

## Connect

Configure the host to run:

```bash
npx -y github:zkp2p/peer-cli#v0.1.0 mcp --profile cash
```

Keep optional `PEER_CASH_*` values in the host's secret or MCP configuration,
never in prompts or tracked files. Never replace an existing MCP definition
without inspecting it and obtaining operator approval.

## Execute

1. Call `peer_cash_capabilities`; never name a rail, currency, asset, or amount
   bound from memory.
2. Call `peer_cash_estimate`. State that the Chainlink estimate is approximate;
   the binding rate resolves when a buyer fills.
3. Call `peer_cash_prepare` with the Base USDC amount as a 6-decimal base-unit
   string and the required receive legs. For example, 100 USDC is `100000000`.
4. Show the ordered unsigned transaction plan, destination, value, calldata
   purpose, and expected effect. Obtain explicit approval for that exact plan.
5. Have the host wallet submit each transaction in order and confirm the
   `createDeposit` receipt.
6. Call `peer_cash_finalize` with the confirmed transaction hash. If
   `accessPolicyRequired` is true, prepare, approve, and submit the access-policy
   transaction with the depositor wallet.
7. Persist the returned `depositId`; use `peer_cash_order` to resume.

Use `peer_cash_orders` to list a maker's orders,
`peer_cash_prepare_withdraw` to build a full or partial unmatched-funds
withdrawal, and `peer_cash_prepare_top_up` to add funds. Apply the same ordered
approval and confirmation rules.

## Recover safely

- Retry `ORDER_NOT_FOUND` only as a read; immediate post-finalization misses may
  be indexer lag.
- For `TRANSACTION_SUBMISSION_UNKNOWN` or `TRANSACTION_STATUS_UNKNOWN`, inspect
  the named hash, wallet activity, and existing orders before any resubmission.
- For `ACCESS_POLICY_CONFIGURATION_FAILED`, repair the policy step; the deposit
  already exists.
- Retry `INDEXER_UNAVAILABLE` and `ORACLE_READ_FAILED` only as reads.

If evidence cannot prove whether a mutation occurred, stop and require wallet
or block-explorer confirmation. Never request a private key or seed phrase.
