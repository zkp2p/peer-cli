import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeDefinition } from '../src/commands/framework.js';
import { commandDefinitions } from '../src/commands/registry.js';
import { createMockRuntime } from './helpers/mock-runtime.js';

const sdkMocks = vi.hoisted(() => ({
  getRateManagerContracts: vi.fn(() => ({ addresses: { registry: '0x2222222222222222222222222222222222222222' } })),
  resolvePaymentMethodHash: vi.fn(() => '0x3333333333333333333333333333333333333333'),
  resolveFiatCurrencyBytes32: vi.fn(() => '0x4444444444444444444444444444444444444444'),
  validateOracleFeedsOnChain: vi.fn(async () => ['feed-ok']),
  startPeerMcpServer: vi.fn(async () => ({ started: true })),
}));

vi.mock('@zkp2p/sdk', () => ({
  getRateManagerContracts: sdkMocks.getRateManagerContracts,
  resolvePaymentMethodHash: sdkMocks.resolvePaymentMethodHash,
  resolveFiatCurrencyBytes32: sdkMocks.resolveFiatCurrencyBytes32,
  validateOracleFeedsOnChain: sdkMocks.validateOracleFeedsOnChain,
}));

vi.mock('../src/mcp/server.js', () => ({
  startPeerMcpServer: sdkMocks.startPeerMcpServer,
}));

const previousHome = process.env.HOME;

afterEach(() => {
  vi.clearAllMocks();
  process.env.HOME = previousHome;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function definition(path: string[]): (typeof commandDefinitions)[number] {
  const spec = commandDefinitions.find((entry) => entry.path.join(' ') === path.join(' '));
  if (!spec) {
    throw new Error(`Missing command definition: ${path.join(' ')}`);
  }
  return spec;
}

async function run(
  path: string[],
  input: Record<string, unknown>,
  runtime = createMockRuntime(),
  globalOptions: Record<string, unknown> = {},
) {
  return executeDefinition(definition(path), input, globalOptions as never, runtime.deps);
}

async function call(path: string[], input: Record<string, unknown>, runtime = createMockRuntime()) {
  return definition(path).handler(input, runtime.context);
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'peer-cli-cmd-'));
  process.env.HOME = home;
  return fn(home);
}

describe('registry-backed command handlers', () => {
  it('handles quote and payee commands', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getQuote: async (...args: unknown[]) => [{ route: 'fast', price: '1.23', args }],
        registerPayeeDetails: async (...args: unknown[]) => ({ path: 'registerPayeeDetails', args }),
        resolvePayeeHash: async (...args: unknown[]) => ({
          path: 'resolvePayeeHash',
          args: args.map((value) => (typeof value === 'bigint' ? value.toString() : value)),
        }),
      },
    });

    const quote = await executeDefinition(definition(['quote']), {
      from: 'USD',
      amount: 25,
      platform: 'wise,venmo',
      quotesToReturn: 2,
    }, {}, runtime.deps);

    expect(quote).toMatchObject({ ok: true, data: [{ route: 'fast', price: '1.23' }] });

    const payee = await executeDefinition(definition(['payee', 'register']), {
      processors: 'wise,venmo',
      depositData: '[{"name":"one"}]',
    }, {}, runtime.deps);
    expect(payee).toMatchObject({ ok: true, data: { path: 'registerPayeeDetails' } });

    const resolved = await executeDefinition(definition(['payee', 'resolve-hash']), {
      depositId: '5',
      paymentMethodHash: '0xabc',
    }, {}, runtime.deps);
    expect(resolved).toMatchObject({ ok: true, data: { path: 'resolvePayeeHash' } });

    const takerTier = await executeDefinition(definition(['taker', 'tier']), {
      address: '0x1111111111111111111111111111111111111111',
    }, {}, runtime.deps);
    expect(takerTier).toMatchObject({ ok: true, data: { responseObject: { tier: 'standard' } } });
  });

  it('handles deposit lifecycle commands', async () => {
    const runtime = createMockRuntime({ yes: true });
    await expect(run(['deposit', 'ensure-allowance'], { amount: 10 }, runtime)).resolves.toMatchObject({
      ok: true,
      data: {
        executed: true,
        previewData: expect.objectContaining({
          requiredAmount: '10000000',
        }),
        result: { ok: true },
      },
    });

    await expect(run(['deposit', 'create'], {
      amount: 100,
      min: 10,
      max: 20,
      platforms: 'wise,venmo',
      currencies: 'USD,EUR',
      rate: 1.2,
      depositData: '[]',
      retainOnEmpty: true,
    }, runtime)).resolves.toMatchObject({
      ok: true,
      data: {
        executed: true,
        preview: expect.objectContaining({ to: expect.any(String), data: expect.any(String) }),
      },
    });

    await expect(run(['deposit', 'list'], {}, runtime)).resolves.toMatchObject({
      ok: true,
      data: [{ id: '1' }],
    });

    await expect(run(['deposit', 'show'], { depositId: '7' }, runtime)).resolves.toMatchObject({
      ok: true,
      data: { id: '1' },
    });

    const paymentMethodAdd = await run(['deposit', 'payment-method', 'add'], {
      id: '7',
      paymentMethods: 'wise,venmo',
      paymentMethodData: '[]',
      currencies: '["USD"]',
    }, runtime);
    expect(paymentMethodAdd.ok).toBe(true);
    const paymentMethodAddData = paymentMethodAdd.data as { executed: boolean; result: { path: string } };
    expect(paymentMethodAddData.executed).toBe(true);
    expect(paymentMethodAddData.result.path).toBe('addPaymentMethods');

    const oracleSet = await run(['deposit', 'oracle', 'set'], {
      id: '7',
      paymentMethodHash: '0x1',
      currencyHash: '0x2',
      config: '{"feed":"demo"}',
    }, runtime);
    expect(oracleSet.ok).toBe(true);
    const oracleSetData = oracleSet.data as { executed: boolean; result: { path: string } };
    expect(oracleSetData.executed).toBe(true);
    expect(oracleSetData.result.path).toBe('setOracleRateConfig');
  });

  it('handles intent and hook commands', async () => {
    const runtime = createMockRuntime({ yes: true });
    await expect(call(['intent', 'create'], {
      deposit: '1',
      amount: 2,
      platform: 'wise',
      currency: 'USD',
      to: '0x1111111111111111111111111111111111111111',
      rate: 1.2,
      payeeDetails: 'details',
      processorIntentData: '{"note":"x"}',
    }, runtime)).resolves.toMatchObject({ executed: true });

    await expect(call(['intent', 'list'], {}, runtime)).resolves.toEqual([{ hash: '0x1' }]);

    await expect(call(['intent', 'fulfill'], {
      hash: '0xhash',
      proof: '{"proof":"ok"}',
      precomputedAttestation: '{"attested":true}',
    }, runtime)).resolves.toMatchObject({ executed: true });

    await expect(call(['intent-hook', 'pre', 'set'], { id: '1', hook: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({ executed: true });
    await expect(call(['intent-hook', 'pre', 'get'], { depositId: '1' }, runtime)).resolves.toMatchObject({ path: 'getDepositPreIntentHook' });
    await expect(call(['indexer', 'intents', 'by-deposit-ids'], { depositIds: '["1"]' }, runtime)).resolves.toMatchObject({ path: 'indexer.getIntentsForDeposits' });
  });

  it('handles vault and delegate commands', async () => {
    const runtime = createMockRuntime({ yes: true });
    await expect(call(['vault', 'create'], {
      manager: '0x1111111111111111111111111111111111111111',
      feeRecipient: '0x1111111111111111111111111111111111111111',
      fee: 1,
      name: 'Vault',
      uri: 'ipfs://demo',
    }, runtime)).resolves.toMatchObject({ executed: true });

    await expect(call(['vault', 'set-rate'], {
      id: '7',
      platform: 'wise',
      currency: 'USD',
      rate: 1.25,
    }, runtime)).resolves.toMatchObject({ executed: true });
    expect(sdkMocks.resolvePaymentMethodHash).toHaveBeenCalledWith('wise', { env: 'production' });

    await expect(call(['vault', 'effective-rate'], {
      escrow: '0x1111111111111111111111111111111111111111',
      depositId: '7',
      platform: 'wise',
      currency: 'USD',
    }, runtime)).resolves.toMatchObject({ path: 'getEffectiveRate' });

    await expect(call(['oracle', 'validate-feeds'], {}, runtime)).resolves.toEqual(['feed-ok']);

    await expect(call(['delegate', 'set'], { deposit: '7', vault: 'vault-1' }, runtime)).resolves.toMatchObject({ executed: true });
    expect(sdkMocks.getRateManagerContracts).toHaveBeenCalledWith(8453, 'production');

    await expect(call(['delegate', 'show'], { deposit: '7' }, runtime)).resolves.toMatchObject({ path: 'getDepositRateManager' });
    await expect(call(['indexer', 'delegations', 'by-deposit'], { depositId: '7' }, runtime)).resolves.toMatchObject({ path: 'indexer.getDelegationForDeposit' });
  });

  it('handles market, transfer, and checkout commands', async () => {
    await withTempHome(async (home) => {
      const runtime = createMockRuntime({
        yes: true,
        config: {
          payApiKey: 'pay-key',
          marketApiKey: 'market-key',
          payBaseUrl: 'https://pay.example',
          marketBaseUrl: 'https://market.example',
        },
        requestJson: async (url, options) => {
          if (url.includes('/v1/checkout/session') && !url.includes('/cancel')) {
            return { orderId: 'order-1', status: 'created', url, options };
          }
          if (url.includes('/v1/checkout/session/order-1/cancel')) {
            return { orderId: 'order-1', status: 'cancelled', url, options };
          }
          return { url, options };
        },
      });

      await expect(run(['market', 'spreads'], { platform: 'wise', currency: 'USD' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/spreads?paymentPlatforms=wise&fiatCurrencies=USD' },
      });

      await expect(run(['market', 'compare'], { from: 'USD', amount: 10 }, runtime)).resolves.toMatchObject({
        ok: true,
        data: [{ route: 'fast', price: '1.23' }],
      });

      await expect(run(['market', 'volume'], { platform: 'wise', currency: 'USD', period: '24h', granularity: 'daily' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/volume?paymentPlatforms=wise&fiatCurrency=USD&period=1d&granularity=daily' },
      });

      await expect(run(['market', 'leaderboard'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/leaderboard/makers?period=7d&limit=10&sortBy=volume' },
      });

      await expect(run(['market', 'protocol-stats'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/protocol/stats' },
      });

      await expect(run(['transfer'], { to: '0x1111111111111111111111111111111111111111', amount: 1 }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { executed: true, result: '0xsent' },
      });

      await expect(run(['balance'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { raw: '123', formatted: '0.000123' },
      });

    const create = await run(['checkout', 'create'], {
      amount: 12,
      description: 'Order',
      }, runtime);
      expect(create).toMatchObject({ ok: true, data: { executed: true, result: { orderId: 'order-1' } } });
      expect(await readFile(join(home, '.peer', 'checkout-sessions.json'), 'utf8')).toContain('order-1');

      const list = await run(['checkout', 'list'], { status: 'pending' }, createMockRuntime({
        config: {
          payBaseUrl: 'https://pay.example',
          payApiKey: undefined,
        },
      }));
      expect(list).toMatchObject({ ok: true, data: { source: 'cache', sessions: [{ orderId: 'order-1', status: 'created' }] } });

      const show = await run(['checkout', 'show'], { sessionId: 'order-1' }, createMockRuntime({
        config: { payApiKey: undefined },
      }));
      expect(show).toMatchObject({ ok: true, data: { source: 'cache', session: { orderId: 'order-1', status: 'created' } } });

      const cancel = await run(['checkout', 'cancel'], { sessionId: 'order-1' }, runtime);
      expect(cancel).toMatchObject({ ok: true, data: { executed: true, result: { status: 'cancelled' } } });
    });
  });

  it('handles config commands through the stored file surface', async () => {
    await withTempHome(async (_home) => {
      const runtime = createMockRuntime();
      const set = await run(['config', 'set'], { key: 'env', value: 'staging' }, runtime);
      expect(set).toMatchObject({ ok: true, data: { env: 'staging' } });

      const show = await run(['config', 'show'], {}, runtime);
      expect(show).toMatchObject({ ok: true, data: expect.objectContaining({ resolved: expect.any(Object) }) });

      const platforms = await run(['config', 'platforms'], {}, runtime);
      expect(platforms).toMatchObject({ ok: true, data: expect.arrayContaining(['wise', 'venmo']) });

      const currencies = await run(['config', 'currencies'], {}, runtime);
      expect(currencies).toMatchObject({ ok: true, data: expect.arrayContaining(['USD', 'EUR']) });
    });
  });
});
