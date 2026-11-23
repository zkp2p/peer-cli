import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPeerCashTools } from '../src/mcp/cash.js';

const depositId = '0x1111111111111111111111111111111111111111_7';
const transactionHash = `0x${'ab'.repeat(32)}` as `0x${string}`;
const paymentMethod = `0x${'cd'.repeat(32)}` as `0x${string}`;

function createHarness(includeWrites = false) {
  const registerTool = vi.fn();
  const client = {
    capabilities: vi.fn(() => ({ minimum: 1n })),
    fillStats: vi.fn(async () => ({ 'wise:USD': { fills: 12 } })),
    estimate: vi.fn(async () => ({ amountFiat: '99.25' })),
    prepare: vi.fn(async () => ({ transactions: [{ value: 0n }] })),
    finalizePrepared: vi.fn(() => ({ depositId })),
    buyer: vi.fn(async () => ({ address: '0x1111111111111111111111111111111111111111' })),
    order: vi.fn(async () => ({ depositId, status: 'open' })),
    orders: vi.fn(async () => [{ depositId }]),
    prepareWithdraw: vi.fn(async () => ({ transactions: [] })),
    prepareTopUp: vi.fn(async () => ({ transactions: [] })),
  };
  const cashOnlyClient = {
    sourceCapabilities: vi.fn(async () => ({ chains: [] })),
    quoteSource: vi.fn(async () => ({ requestId: 'relay-1', txs: [] })),
    relayStatus: vi.fn(async () => ({ requestId: 'relay-1', status: 'pending' })),
    prepareAccessPolicy: vi.fn(async () => ({ transactions: [] })),
  };
  const receiptClient = {
    getTransactionReceipt: vi.fn(async () => ({
      transactionHash,
      status: 'success' as const,
      logs: [],
    })),
  };

  registerPeerCashTools({ registerTool } as never, {
    config: {
      client: client as never,
      cashOnlyClient: cashOnlyClient as never,
      receiptClient: receiptClient as never,
    },
    includeWrites,
  });

  const handlers = new Map(
    registerTool.mock.calls.map(([name, _config, handler]) => [name as string, handler]),
  );
  return { cashOnlyClient, client, handlers, receiptClient, registerTool };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Peer Cash MCP tools', () => {
  it('keeps transaction preparation out of the read-only profile', () => {
    const { handlers } = createHarness();
    expect([...handlers.keys()]).toEqual([
      'peer_cash_capabilities',
      'peer_cash_fill_stats',
      'peer_cash_source_capabilities',
      'peer_cash_quote_source',
      'peer_cash_relay_status',
      'peer_cash_estimate',
      'peer_cash_finalize',
      'peer_cash_buyer',
      'peer_cash_order',
      'peer_cash_orders',
    ]);
  });

  it('exposes the complete custody-separated surface in cash mode', () => {
    const { handlers } = createHarness(true);
    expect([...handlers.keys()]).toEqual([
      'peer_cash_capabilities',
      'peer_cash_fill_stats',
      'peer_cash_source_capabilities',
      'peer_cash_quote_source',
      'peer_cash_relay_status',
      'peer_cash_estimate',
      'peer_cash_finalize',
      'peer_cash_buyer',
      'peer_cash_order',
      'peer_cash_orders',
      'peer_cash_prepare',
      'peer_cash_prepare_access_policy',
      'peer_cash_prepare_withdraw',
      'peer_cash_prepare_top_up',
    ]);
  });

  it('serializes bigint responses and forwards validated inputs', async () => {
    const { client, handlers } = createHarness(true);
    const capabilities = await handlers.get('peer_cash_capabilities')!({});
    const estimate = await handlers.get('peer_cash_estimate')!({
      amount: '100000000',
      currency: 'usd',
      platform: 'wise',
    });

    expect(capabilities.content[0].text).toContain('"minimum": "1"');
    expect(client.capabilities).toHaveBeenCalledWith();
    expect(client.estimate).toHaveBeenCalledWith({
      amount: 100000000n,
      currency: 'USD',
      platform: 'wise',
    });
    expect(estimate.isError).not.toBe(true);
  });

  it('exposes live source routing and analytics inputs without signer authority', async () => {
    const { cashOnlyClient, client, handlers } = createHarness();
    await handlers.get('peer_cash_fill_stats')!({});
    await handlers.get('peer_cash_source_capabilities')!({});
    await handlers.get('peer_cash_quote_source')!({
      user: '0x1111111111111111111111111111111111111111',
      amount: '2500000',
      sourceChainId: 10,
      sourceCurrency: '0x2222222222222222222222222222222222222222',
      recipient: '0x3333333333333333333333333333333333333333',
      tradeType: 'EXACT_INPUT',
    });
    await handlers.get('peer_cash_relay_status')!({ requestId: 'relay-1' });
    await handlers.get('peer_cash_buyer')!({
      address: '0x1111111111111111111111111111111111111111',
    });

    expect(client.fillStats).toHaveBeenCalledOnce();
    expect(cashOnlyClient.sourceCapabilities).toHaveBeenCalledOnce();
    expect(cashOnlyClient.quoteSource).toHaveBeenCalledWith({
      user: '0x1111111111111111111111111111111111111111',
      amount: 2500000n,
      source: {
        chainId: 10,
        currency: '0x2222222222222222222222222222222222222222',
      },
      recipient: '0x3333333333333333333333333333333333333333',
      tradeType: 'EXACT_INPUT',
    });
    expect(cashOnlyClient.relayStatus).toHaveBeenCalledWith('relay-1');
    expect(client.buyer).toHaveBeenCalledWith(
      '0x1111111111111111111111111111111111111111',
    );
  });

  it('finalizes only from the confirmed receipt returned by Base', async () => {
    const { client, handlers, receiptClient } = createHarness();
    await handlers.get('peer_cash_finalize')!({ transactionHash });

    expect(receiptClient.getTransactionReceipt).toHaveBeenCalledWith({
      hash: transactionHash,
    });
    expect(client.finalizePrepared).toHaveBeenCalledWith({
      transactionHash,
      status: 'success',
      logs: [],
    });
  });

  it('prepares the required method-scoped access policy on @zkp2p/cash', async () => {
    const { cashOnlyClient, handlers, registerTool } = createHarness(true);
    await handlers.get('peer_cash_prepare_access_policy')!({ depositId, paymentMethod });

    expect(cashOnlyClient.prepareAccessPolicy).toHaveBeenCalledWith(depositId, paymentMethod);
    const registration = registerTool.mock.calls.find(
      ([name]) => name === 'peer_cash_prepare_access_policy',
    );
    expect(registration?.[1].description).toContain('accessPolicyPaymentMethods');
    expect(registration?.[1].description).not.toContain('Cash App');
  });

  it('returns structured MCP errors without throwing transport failures', async () => {
    const { client, handlers } = createHarness();
    client.order.mockRejectedValueOnce(
      Object.assign(new Error('Indexer unavailable'), {
        code: 'INDEXER_UNAVAILABLE',
        retryable: true,
      }),
    );

    const result = await handlers.get('peer_cash_order')!({ depositId });
    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          message: 'Indexer unavailable',
          code: 'INDEXER_UNAVAILABLE',
          retryable: true,
        },
      },
    });
  });

  it('rejects an invalid environment before registering tools', () => {
    expect(() =>
      registerPeerCashTools({ registerTool: vi.fn() } as never, {
        config: { environment: 'invalid' as never, client: {} as never },
        includeWrites: false,
      }),
    ).toThrow('Peer Cash environment must be production, preproduction, or staging');
  });
});
