import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  createCashClient,
  type CashClient,
  type CashClientOptions,
  type CashoutInput,
  type CurrencyType,
} from '@zkp2p/cash';
import {
  createPublicClient,
  http,
  type Hash,
  type TransactionReceipt,
} from 'viem';
import { base } from 'viem/chains';
import { z } from 'zod/v4';
import type { GlobalOptions } from '../sdk/config.js';

export interface ReceiptClient {
  getTransactionReceipt(parameters: {
    hash: Hash;
  }): Promise<TransactionReceipt>;
}

export interface PeerCashMcpConfig {
  client?: CashClient;
  receiptClient?: ReceiptClient;
  environment?: CashClientOptions['environment'];
  rpcUrl?: string;
  apiKey?: string;
  referralCode?: string;
  referrer?: string | string[];
}

interface RegisterPeerCashToolsOptions {
  config?: PeerCashMcpConfig;
  globalOptions?: GlobalOptions;
  includeWrites: boolean;
}

export const PEER_CASH_TOOL_NAMES = {
  capabilities: 'peer_cash_capabilities',
  fillStats: 'peer_cash_fill_stats',
  sourceCapabilities: 'peer_cash_source_capabilities',
  quoteSource: 'peer_cash_quote_source',
  relayStatus: 'peer_cash_relay_status',
  estimate: 'peer_cash_estimate',
  finalize: 'peer_cash_finalize',
  buyer: 'peer_cash_buyer',
  order: 'peer_cash_order',
  orders: 'peer_cash_orders',
  prepare: 'peer_cash_prepare',
  prepareAccessPolicy: 'peer_cash_prepare_access_policy',
  prepareWithdraw: 'peer_cash_prepare_withdraw',
  prepareTopUp: 'peer_cash_prepare_top_up',
} as const;

export const PEER_CASH_READ_TOOL_NAMES = [
  PEER_CASH_TOOL_NAMES.capabilities,
  PEER_CASH_TOOL_NAMES.fillStats,
  PEER_CASH_TOOL_NAMES.sourceCapabilities,
  PEER_CASH_TOOL_NAMES.quoteSource,
  PEER_CASH_TOOL_NAMES.relayStatus,
  PEER_CASH_TOOL_NAMES.estimate,
  PEER_CASH_TOOL_NAMES.finalize,
  PEER_CASH_TOOL_NAMES.buyer,
  PEER_CASH_TOOL_NAMES.order,
  PEER_CASH_TOOL_NAMES.orders,
] as const;

export const PEER_CASH_WRITE_TOOL_NAMES = [
  PEER_CASH_TOOL_NAMES.prepare,
  PEER_CASH_TOOL_NAMES.prepareAccessPolicy,
  PEER_CASH_TOOL_NAMES.prepareWithdraw,
  PEER_CASH_TOOL_NAMES.prepareTopUp,
] as const;

const environments = new Set<CashClientOptions['environment']>([
  'production',
  'preproduction',
  'staging',
]);

function resolveEnvironment(
  config: PeerCashMcpConfig,
  globalOptions: GlobalOptions,
): CashClientOptions['environment'] {
  const value =
    config.environment ??
    process.env.PEER_CASH_ENVIRONMENT ??
    globalOptions.env ??
    process.env.PEER_ENV ??
    'production';

  if (!environments.has(value as CashClientOptions['environment'])) {
    throw new Error(
      `Peer Cash environment must be production, preproduction, or staging; received ${value}`,
    );
  }
  return value as CashClientOptions['environment'];
}

function resolveConfig(
  config: PeerCashMcpConfig = {},
  globalOptions: GlobalOptions = {},
): PeerCashMcpConfig {
  return {
    ...config,
    environment: resolveEnvironment(config, globalOptions),
    rpcUrl:
      config.rpcUrl ??
      process.env.PEER_CASH_RPC_URL ??
      globalOptions.rpcUrl ??
      process.env.PEER_RPC_URL,
    apiKey:
      config.apiKey ??
      process.env.PEER_CASH_API_KEY ??
      globalOptions.apiKey ??
      process.env.PEER_API_KEY,
    referralCode:
      config.referralCode ?? process.env.PEER_CASH_REFERRAL_CODE,
    referrer: config.referrer ?? process.env.PEER_CASH_REFERRER,
  };
}

function getCashClient(config: PeerCashMcpConfig): CashClient {
  if (config.client) return config.client;

  return createCashClient({
    environment: config.environment ?? 'production',
    ...(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {}),
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.referralCode ? { referralCode: config.referralCode } : {}),
    ...(config.referrer ? { referrer: config.referrer } : {}),
  });
}

function getReceiptClient(config: PeerCashMcpConfig): ReceiptClient {
  if (config.receiptClient) return config.receiptClient;

  return createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });
}

function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as unknown;
}

function toolResult(value: unknown): CallToolResult {
  const result = jsonSafe(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: { result },
  };
}

function toolError(error: unknown): CallToolResult {
  const source = error as {
    message?: unknown;
    code?: unknown;
    retryable?: unknown;
    remediation?: unknown;
    recovery?: unknown;
  };
  const result = jsonSafe({
    error: {
      message:
        typeof source?.message === 'string'
          ? source.message
          : 'Peer Cash request failed',
      ...(typeof source?.code === 'string' ? { code: source.code } : {}),
      ...(typeof source?.retryable === 'boolean'
        ? { retryable: source.retryable }
        : {}),
      ...(typeof source?.remediation === 'string'
        ? { remediation: source.remediation }
        : {}),
      ...(source?.recovery ? { recovery: source.recovery } : {}),
    },
  });
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: result as Record<string, unknown>,
    isError: true,
  };
}

async function handleTool(
  operation: () => unknown | Promise<unknown>,
): Promise<CallToolResult> {
  try {
    return toolResult(await operation());
  } catch (error) {
    return toolError(error);
  }
}

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/, 'Use a positive decimal integer in base units');
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Use an EVM address');
const hash = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Use a transaction hash');
const depositId = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}_[0-9]+$/, 'Use a composite Peer deposit id');
const payee = z.union([
  z.string().min(1),
  z.object({ offchainId: z.string().min(1) }).loose(),
]);
const receiveLeg = z.union([
  z.object({
    platform: z.string().min(1),
    currency: z.string().min(3),
    payee,
  }),
  z.object({
    platform: z.string().min(1),
    currencies: z.array(z.string().min(3)).min(1),
    payee,
  }),
]);
const receive = z.union([receiveLeg, z.array(receiveLeg).min(1)]);

export function registerPeerCashTools(
  server: McpServer,
  options: RegisterPeerCashToolsOptions,
): void {
  const config = resolveConfig(options.config, options.globalOptions);
  const client = getCashClient(config);

  server.registerTool(
    PEER_CASH_TOOL_NAMES.capabilities,
    {
      title: 'Discover Peer Cash capabilities',
      description:
        'Return live Base USDC destinations, payout platforms, fiat currencies, payee hints, amount bounds, and pricing. Call this before naming a rail or currency.',
      inputSchema: {
        includeRelaySources: z
          .boolean()
          .optional()
          .describe('Include live Relay-supported EVM source chains and tokens'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ includeRelaySources }) =>
      handleTool(() =>
        includeRelaySources
          ? client.capabilities({ includeRelaySources: true })
          : client.capabilities(),
      ),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.fillStats,
    {
      title: 'Read Peer Cash fill statistics',
      description:
        'Return trailing 30-day fill counts and first-fill timing by payout platform and currency. Use this as historical routing evidence, never as a guarantee.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    () => handleTool(() => client.fillStats()),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.sourceCapabilities,
    {
      title: 'Discover cross-chain source assets',
      description:
        'Return live Relay-supported EVM source chains and tokens that can route into Base USDC before a Peer Cash order.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    () => handleTool(() => client.sourceCapabilities()),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.quoteSource,
    {
      title: 'Quote a source asset into Base USDC',
      description:
        'Quote a live Relay route from an EVM source asset into Base USDC. The response contains unsigned transaction data; this tool never signs or submits it.',
      inputSchema: {
        user: address.describe('Source-chain wallet address'),
        amount: positiveInteger.describe('Source amount in the source token’s base units'),
        sourceChainId: z.number().int().positive().describe('Relay source chain ID'),
        sourceCurrency: z.string().min(1).describe('Source token address or native currency identifier'),
        recipient: address.optional().describe('Base recipient; defaults to the source wallet'),
        tradeType: z
          .enum(['EXACT_INPUT', 'EXACT_OUTPUT', 'EXPECTED_OUTPUT'])
          .optional()
          .describe('Relay amount mode; defaults to EXACT_INPUT'),
      },
      annotations: { readOnlyHint: true, idempotentHint: false },
    },
    ({ user, amount, sourceChainId, sourceCurrency, recipient, tradeType }) =>
      handleTool(() =>
        client.quoteSource({
          user,
          amount: BigInt(amount),
          source: { chainId: sourceChainId, currency: sourceCurrency },
          ...(recipient ? { recipient } : {}),
          ...(tradeType ? { tradeType } : {}),
        }),
      ),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.relayStatus,
    {
      title: 'Read Relay execution status',
      description:
        'Track a previously submitted cross-chain source route by Relay request ID. Retry this read; never resubmit from an unknown status.',
      inputSchema: { requestId: z.string().min(1) },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ requestId }) => handleTool(() => client.relayStatus(requestId)),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.estimate,
    {
      title: 'Estimate fiat received',
      description:
        'Estimate fiat received for Base USDC at the live Chainlink oracle rate. This is not a locked quote; the binding rate resolves when a buyer fills.',
      inputSchema: {
        amount: positiveInteger.describe('Base USDC amount in 6-decimal base units'),
        currency: z.string().min(3).describe('Fiat currency from capabilities'),
        platform: z
          .string()
          .min(1)
          .optional()
          .describe('Optional payout platform for corridor fill timing'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ amount, currency, platform }) =>
      handleTool(() =>
        client.estimate({
          amount: BigInt(amount),
          currency: currency.toUpperCase() as CurrencyType,
          ...(platform ? { platform } : {}),
        }),
      ),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.finalize,
    {
      title: 'Finalize a confirmed cash-out deposit',
      description:
        'Read a confirmed Base createDeposit receipt and resolve the resumable Peer deposit id. Call only after the host confirms the createDeposit transaction.',
      inputSchema: { transactionHash: hash },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ transactionHash }) =>
      handleTool(async () => {
        const receipt = await getReceiptClient(config).getTransactionReceipt({
          hash: transactionHash as Hash,
        });
        return client.finalizePreparedCashout({
          transactionHash: receipt.transactionHash,
          status: receipt.status,
          logs: receipt.logs,
        });
      }),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.buyer,
    {
      title: 'Read a Peer Cash buyer profile',
      description:
        'Return protocol history for the buyer that matched an order so an automation can assess delivery context without trusting display identity.',
      inputSchema: { address },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ address: buyerAddress }) => handleTool(() => client.buyer(buyerAddress)),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.order,
    {
      title: 'Read a Peer Cash order',
      description:
        'Return one order state, amounts, fills, and next actions from its deposit id. Brief ORDER_NOT_FOUND responses after finalization may be indexer lag; retry this read, never the deposit transaction.',
      inputSchema: { depositId },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ depositId: id }) => handleTool(() => client.order(id)),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.orders,
    {
      title: 'List Peer Cash orders',
      description:
        'List orders owned by a maker wallet, optionally limited to orders that still need attention.',
      inputSchema: {
        owner: address,
        inFlight: z.boolean().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    ({ owner, inFlight, limit }) =>
      handleTool(() =>
        client.orders(owner, {
          ...(inFlight !== undefined ? { inFlight } : {}),
          ...(limit !== undefined ? { limit } : {}),
        }),
      ),
  );

  if (!options.includeWrites) return;

  server.registerTool(
    PEER_CASH_TOOL_NAMES.prepare,
    {
      title: 'Prepare a cash-out',
      description:
        'Prepare unsigned Base USDC approval and createDeposit transactions. The MCP server never accepts a private key or submits a transaction. Show the plan and obtain explicit approval before host-side signing.',
      inputSchema: {
        amount: positiveInteger.describe('Base USDC amount in 6-decimal base units'),
        receive,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    ({ amount, receive: receiveInput }) =>
      handleTool(() =>
        client.prepare({
          amount: BigInt(amount),
          receive: receiveInput as CashoutInput['receive'],
        }),
      ),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.prepareAccessPolicy,
    {
      title: 'Prepare an order access policy',
      description:
        'Prepare the unsigned verified-buyer access-policy transaction required for Venmo, Cash App, or PayPal orders after finalization.',
      inputSchema: { depositId },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    ({ depositId: id }) => handleTool(() => client.prepareAccessPolicy(id)),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.prepareWithdraw,
    {
      title: 'Prepare an order withdrawal',
      description:
        'Prepare unsigned transactions to withdraw unmatched funds. Omit amount to close the order; pass a Base USDC base-unit amount for a partial withdrawal.',
      inputSchema: { depositId, amount: positiveInteger.optional() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    ({ depositId: id, amount }) =>
      handleTool(() =>
        client.prepareWithdraw(id, amount ? { amount: BigInt(amount) } : undefined),
      ),
  );

  server.registerTool(
    PEER_CASH_TOOL_NAMES.prepareTopUp,
    {
      title: 'Prepare an order top-up',
      description:
        'Prepare unsigned approval and addFunds transactions to add Base USDC to a live order.',
      inputSchema: { depositId, amount: positiveInteger },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    ({ depositId: id, amount }) =>
      handleTool(() => client.prepareTopUp(id, BigInt(amount))),
  );
}
