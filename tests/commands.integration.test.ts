import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeDefinition } from '../src/commands/framework.js';
import { commandDefinitions } from '../src/commands/registry.js';
import { writeStoredConfig } from '../src/sdk/config.js';
import { createMockRuntime, ORCHESTRATOR_V3_ADDRESS } from './helpers/mock-runtime.js';

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
  it('does not register SDK 0.11 surfaces that no longer control current intents', () => {
    const registered = new Set(commandDefinitions.map((entry) => entry.path.join(' ')));
    expect(registered.has('taker tier')).toBe(false);
    expect(registered.has('intent-hook whitelist set')).toBe(false);
    expect(registered.has('intent-hook whitelist get')).toBe(false);
  });

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
    expect(runtime.calls.find((entry) => entry.path === 'getQuote')?.args[0]).toMatchObject({
      amount: '25000000',
      isExactFiat: true,
      paymentPlatforms: ['wise', 'venmo'],
    });

    const defaultQuote = await executeDefinition(definition(['quote']), {
      from: 'USD',
      amount: 25,
    }, {}, runtime.deps);

    expect(defaultQuote).toMatchObject({ ok: true });
    expect(runtime.calls.filter((entry) => entry.path === 'getQuote').at(-1)?.args[0]).toMatchObject({
      paymentPlatforms: ['wise', 'venmo', 'revolut', 'cashapp', 'mercadopago', 'zelle', 'paypal', 'monzo', 'alipay', 'chime'],
    });

    const payee = await executeDefinition(definition(['payee', 'register']), {
      processors: 'wise,venmo',
      depositData: '[{"email":"one@example.com"},{"handle":"maker"}]',
    }, {}, runtime.deps);
    expect(payee).toMatchObject({ ok: true, data: { path: 'registerPayeeDetails' } });

    const resolved = await executeDefinition(definition(['payee', 'resolve-hash']), {
      depositId: '5',
      paymentMethodHash: '0xabc',
    }, {}, runtime.deps);
    expect(resolved).toMatchObject({ ok: true, data: { path: 'resolvePayeeHash' } });
  });

  it('normalizes common platform-prefixed payee detail aliases before SDK calls', async () => {
    const payeeRuntime = createMockRuntime();
    const payee = await executeDefinition(definition(['payee', 'register']), {
      processors: 'wise,venmo',
      depositData: '[{"wiseEmail":"maker@example.com"},{"venmoHandle":"alice"}]',
    }, {}, payeeRuntime.deps);
    expect(payee).toMatchObject({ ok: true, data: { path: 'registerPayeeDetails' } });
    expect(payeeRuntime.calls.find((entry) => entry.path === 'registerPayeeDetails')?.args[0]).toMatchObject({
      processorNames: ['wise', 'venmo'],
      depositData: [{ email: 'maker@example.com' }, { handle: 'alice' }],
    });

    const depositRuntime = createMockRuntime();
    const deposit = await executeDefinition(definition(['deposit', 'create']), {
      amount: 100,
      min: 10,
      max: 20,
      platforms: 'wise',
      currencies: 'USD',
      rate: 1.2,
      depositData: '[{"wiseEmail":"maker@example.com"}]',
    }, {}, depositRuntime.deps);
    expect(deposit).toMatchObject({ ok: true });
    expect(depositRuntime.calls.find((entry) => entry.path === 'prepareCreateDeposit')?.args[0]).toMatchObject({
      processorNames: ['wise'],
      depositData: [{ email: 'maker@example.com' }],
    });
  });

  it('normalizes upstream quote API failures into canonical API errors', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getQuote: async () => {
          throw {
            name: 'APIError',
            code: 'API',
            message: 'No quotes found',
            status: 404,
            details: {
              url: 'https://api.zkp2p.xyz/v2/quote/exact-fiat?quotesToReturn=5',
            },
          };
        },
      },
    });

    const quote = await executeDefinition(definition(['quote']), {
      from: 'USD',
      amount: 25,
      platform: 'wise',
    }, {}, runtime.deps);

    expect(quote).toMatchObject({
      ok: false,
      error: {
        code: 'API_ERROR',
        category: 'api',
        message: 'No quotes found',
        retryable: false,
        suggestion: 'No upstream liquidity matched the quote request. Try a different amount, currency, or platform, or verify quote API availability.',
        details: expect.objectContaining({
          name: 'APIError',
          code: 'API',
          status: 404,
        }),
      },
    });
  });

  it('validates supported currencies and platforms locally before outbound calls', async () => {
    const quoteRuntime = createMockRuntime();
    const invalidQuote = await run(['quote'], {
      from: 'invalid',
      amount: 25,
    }, quoteRuntime);
    expect(invalidQuote).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: expect.stringContaining('Unsupported currency: INVALID.'),
      },
    });
    expect(quoteRuntime.calls.find((entry) => entry.path === 'getQuote')).toBeUndefined();

    const normalizedQuoteRuntime = createMockRuntime();
    const normalizedQuote = await run(['quote'], {
      from: 'usd',
      amount: 25,
      platform: 'WISE,venmo',
    }, normalizedQuoteRuntime);
    expect(normalizedQuote).toMatchObject({ ok: true });
    expect(normalizedQuoteRuntime.calls.find((entry) => entry.path === 'getQuote')?.args[0]).toMatchObject({
      fiatCurrency: 'USD',
      paymentPlatforms: ['wise', 'venmo'],
    });

    const marketRuntime = createMockRuntime();
    const invalidMarket = await run(['market', 'spreads'], {
      platform: 'not-real',
    }, marketRuntime);
    expect(invalidMarket).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: expect.stringContaining('Unsupported platform: not-real.'),
      },
    });
    expect(marketRuntime.requestJson).not.toHaveBeenCalled();

    const depositRuntime = createMockRuntime({ yes: true });
    const invalidDeposit = await run(['deposit', 'create'], {
      amount: 100,
      min: 10,
      max: 20,
      platforms: 'wise',
      currencies: 'USD,INVALID',
      rate: 1.2,
      depositData: '[{"email":"maker@example.com"}]',
    }, depositRuntime);
    expect(invalidDeposit).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: expect.stringContaining('Unsupported currency: INVALID.'),
      },
    });
    expect(depositRuntime.calls.find((entry) => entry.path === 'prepareCreateDeposit')).toBeUndefined();
  });

  it('reports all missing required quote inputs before outbound calls', async () => {
    const missingBothRuntime = createMockRuntime();
    const missingBoth = await run(['quote'], {}, missingBothRuntime);
    expect(missingBoth).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: 'Missing required options: --from and either --amount or --token-amount.',
      },
    });
    expect(missingBothRuntime.calls.find((entry) => entry.path === 'getQuote')).toBeUndefined();

    const missingFromRuntime = createMockRuntime();
    const missingFrom = await run(['quote'], { amount: 25 }, missingFromRuntime);
    expect(missingFrom).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: 'Missing required option: --from.',
      },
    });
    expect(missingFromRuntime.calls.find((entry) => entry.path === 'getQuote')).toBeUndefined();
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
      depositData: '[{"email":"maker@example.com"},{"handle":"maker"}]',
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

  it('validates deposit create deposit-data requirements before calling the sdk', async () => {
    const runtime = createMockRuntime({ yes: true });

    await expect(run(['deposit', 'create'], {
      amount: 100,
      min: 10,
      max: 20,
      platforms: 'wise',
      currencies: 'USD',
      rate: 1.2,
    }, runtime)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: 'Provide --deposit-data as a JSON array with one platform-specific detail object per entry in --platforms.',
      },
    });

    await expect(run(['deposit', 'create'], {
      amount: 100,
      min: 10,
      max: 20,
      platforms: 'wise,venmo',
      currencies: 'USD,EUR',
      rate: 1.2,
      depositData: '[{"email":"maker@example.com"}]',
    }, runtime)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        category: 'validation',
        message: '--deposit-data must contain exactly one object per platform in --platforms (2 platform(s), 1 entry provided).',
      },
    });
  });

  it('enriches direct deposit reads with readable payment method and currency metadata', async () => {
    const paymentMethodHash = '0xaea63ef983458674f54ee50cdaa7b09d80a5c6c03ed505f51c90b0f2b54abb01';
    const currencyHash = '0xc4ae21aac0c6549d71dd96035b7e0bdb6c79ebdba8891b666115bc976d16a29e';
    const depositPayload = {
      depositId: '1',
      paymentMethods: [
        {
          paymentMethod: paymentMethodHash,
          currencies: [
            {
              code: currencyHash,
              minConversionRate: '1020000000000000000',
            },
          ],
        },
      ],
    };
    const runtime = createMockRuntime({
      behaviors: {
        getDeposit: () => depositPayload,
        getPvDepositById: () => depositPayload,
        getAccountDeposits: () => [depositPayload],
        getDeposits: () => [depositPayload],
      },
    });

    await expect(run(['deposit', 'show'], { depositId: '1' }, runtime)).resolves.toMatchObject({
      ok: true,
      data: {
        paymentMethods: [
          {
            paymentMethod: paymentMethodHash,
            paymentMethodName: 'luxon',
            currencies: [
              {
                code: currencyHash,
                currencyName: 'USD',
                minConversionRate: '1020000000000000000',
                minConversionRateDecimal: '1.02',
              },
            ],
          },
        ],
      },
    });

    await expect(run(['pv', 'deposit', 'show'], { depositId: '1' }, runtime)).resolves.toMatchObject({
      ok: true,
      data: {
        paymentMethods: [
          {
            paymentMethodName: 'luxon',
            currencies: [{ currencyName: 'USD', minConversionRateDecimal: '1.02' }],
          },
        ],
      },
    });

    await expect(run(['deposit', 'list'], {}, runtime)).resolves.toMatchObject({
      ok: true,
      data: [
        {
          paymentMethods: [
            {
              paymentMethodName: 'luxon',
              currencies: [{ currencyName: 'USD', minConversionRateDecimal: '1.02' }],
            },
          ],
        },
      ],
    });
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

    await expect(call(['intent', 'cleanup-orphaned'], { hashes: '["0xhash"]' }, runtime)).resolves.toMatchObject({ executed: true });
    await expect(call(['intent-hook', 'pre', 'set'], { id: '1', hook: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({ executed: true });
    await expect(call(['intent-hook', 'pre', 'get'], { depositId: '1' }, runtime)).resolves.toMatchObject({ path: 'getDepositPreIntentHook' });
    expect(runtime.calls.find((entry) => entry.path === 'cleanupOrphanedIntents')?.args[0]).toMatchObject({
      orchestratorAddress: ORCHESTRATOR_V3_ADDRESS,
    });
    expect(runtime.calls.find((entry) => entry.path === 'setDepositPreIntentHook')?.args[0]).toMatchObject({
      orchestratorAddress: ORCHESTRATOR_V3_ADDRESS,
    });
    expect(runtime.calls.find((entry) => entry.path === 'getDepositPreIntentHook')?.args[1]).toEqual({
      orchestratorAddress: ORCHESTRATOR_V3_ADDRESS,
    });
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
          marketBaseUrl: 'https://market.example/',
        },
        requestJson: async (url, options) => {
          if (url.endsWith('/api/merchants/me')) {
            return {
              success: true,
              responseObject: {
                id: 'merchant-1',
                defaultAddress: '0x1111111111111111111111111111111111111111',
              },
            };
          }
          if (url.endsWith('/api/checkout/sessions')) {
            return {
              success: true,
              responseObject: {
                session: { id: 'session-1', status: 'CREATED' },
                sessionToken: 'token-1',
                checkoutUrl: 'https://pay.example/checkout?session=session-1&token=token-1',
                url,
                options,
              },
            };
          }
          if (url.includes('/v1/checkout/session/order-1/cancel')) {
            return { orderId: 'order-1', status: 'cancelled', url, options };
          }
          return { url, options };
        },
      });

      await expect(run(['market', 'spreads'], { platform: 'wise', currency: 'USD' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/market/summary?platform=wise&currency=USD&limit=200' },
      });

      await expect(run(['market', 'orderbook'], { currency: 'EUR', platform: 'wise', minSize: 100 }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/orderbook?currency=EUR&platform=wise&minSize=100' },
      });

      const compare = await run(['market', 'compare'], { from: 'USD', amount: 10 }, runtime);
      expect(compare).toMatchObject({
        ok: true,
        data: [{ route: 'fast', price: '1.23' }],
      });
      expect(runtime.calls.filter((entry) => entry.path === 'getQuote').at(-1)?.args[0]).toMatchObject({
        amount: '10000000',
        isExactFiat: true,
      });

      await expect(run(['market', 'volume'], { platform: 'wise', currency: 'USD', range: 'mtd' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/analytics/overview?range=mtd&platform=wise&currency=USD' },
      });

      await expect(run(['market', 'leaderboard'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/analytics/leaderboard?limit=20&offset=0' },
      });

      await expect(run(['market', 'protocol-stats'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/analytics/summary' },
      });

      // --- New Peerlytics commands ---

      await expect(run(['market', 'vaults'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/analytics/vaults?limit=50&offset=0' },
      });

      await expect(run(['market', 'explorer', 'address'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/address/0x1111111111111111111111111111111111111111?limit=100&offset=0' },
      });

      await expect(run(['market', 'explorer', 'deposit'], { id: '123' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/deposit/123?limit=100&offset=0' },
      });

      await expect(run(['market', 'explorer', 'intent'], { hash: '0xabc' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/intent/0xabc' },
      });

      await expect(run(['market', 'explorer', 'maker'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/maker/0x1111111111111111111111111111111111111111' },
      });

      await expect(run(['market', 'explorer', 'verifier'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/verifier/0x1111111111111111111111111111111111111111' },
      });

      await expect(run(['market', 'explorer', 'vault'], { id: '42' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/vault/42' },
      });

      await expect(run(['market', 'explorer', 'search'], { query: '0xtest' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/explorer/search?q=0xtest' },
      });

      await expect(run(['market', 'deposits'], { depositor: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/deposits?depositor=0x1111111111111111111111111111111111111111&limit=50&offset=0' },
      });

      const marketDepositsMissingFilter = await run(['market', 'deposits'], {}, runtime);
      expect(marketDepositsMissingFilter).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one filter is required: --depositor, --delegate, --platform, or --currency.',
        },
      });

      await expect(run(['market', 'intents'], { status: 'FULFILLED', limit: 10 }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/intents?status=FULFILLED&limit=10&offset=0' },
      });

      await expect(run(['market', 'activity'], { type: 'intent_fulfilled', limit: 5 }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/activity?type=intent_fulfilled&limit=5' },
      });

      await expect(run(['market', 'taker-history'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/takers/0x1111111111111111111111111111111111111111/history' },
      });

      await expect(run(['market', 'maker-history'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/makers/0x1111111111111111111111111111111111111111/history' },
      });

      await expect(run(['market', 'meta', 'platforms'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/meta/platforms' },
      });

      await expect(run(['market', 'meta', 'currencies'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/meta/currencies' },
      });

      await expect(run(['market', 'api-key', 'list'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/account/keys' },
      });

      await expect(run(['market', 'api-key', 'create'], { label: 'test' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/account/keys' },
      });

      await expect(run(['market', 'api-key', 'rotate'], { key: 'pk_old' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/account/keys' },
      });

      await expect(run(['market', 'api-key', 'delete'], { key: 'pk_old' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/account/keys' },
      });

      await expect(run(['market', 'credits'], {}, runtime)).resolves.toMatchObject({
        ok: true,
        data: { url: 'https://market.example/v1/account/credits' },
      });

      // API key commands require marketApiKey
      const noKeyRuntime = createMockRuntime({ config: { marketBaseUrl: 'https://market.example/' } });
      await expect(run(['market', 'api-key', 'list'], {}, noKeyRuntime)).resolves.toMatchObject({
        ok: false,
        error: { code: 'AUTH_REQUIRED' },
      });
      await expect(run(['market', 'credits'], {}, noKeyRuntime)).resolves.toMatchObject({
        ok: false,
        error: { code: 'AUTH_REQUIRED' },
      });

      await expect(run(['transfer'], { to: '0x1111111111111111111111111111111111111111', amount: 1 }, runtime)).resolves.toMatchObject({
        ok: true,
        data: {
          executed: true,
          preview: {
            description: 'Transfer 1 USDC to 0x1111111111111111111111111111111111111111.',
          },
          result: '0xsent',
        },
      });

      await expect(run(['balance'], { address: '0x1111111111111111111111111111111111111111' }, runtime)).resolves.toMatchObject({
        ok: true,
        data: { raw: '123', formatted: '0.000123' },
      });

    const create = await run(['checkout', 'create'], {
      amount: 12,
      description: 'Order',
      }, runtime);
      expect(create).toMatchObject({ ok: true, data: { executed: true, result: { session: { id: 'session-1' } } } });
      expect(await readFile(join(home, '.peer', 'checkout-sessions.json'), 'utf8')).toContain('session-1');

      const list = await run(['checkout', 'list'], { status: 'pending' }, createMockRuntime({
        config: {
          payBaseUrl: 'https://pay.example',
          payApiKey: undefined,
        },
      }));
      expect(list).toMatchObject({ ok: true, data: { source: 'cache', sessions: [{ id: 'session-1', status: 'CREATED' }] } });

      const show = await run(['checkout', 'show'], { sessionId: 'session-1' }, createMockRuntime({
        config: { payApiKey: undefined },
      }));
      expect(show).toMatchObject({ ok: true, data: { source: 'cache', session: { id: 'session-1', status: 'CREATED' } } });

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
      expect(platforms).toMatchObject({
        ok: true,
        data: ['wise', 'venmo', 'revolut', 'cashapp', 'mercadopago', 'zelle', 'paypal', 'monzo', 'alipay', 'chime'],
      });

      const currencies = await run(['config', 'currencies'], {}, runtime);
      expect(currencies).toMatchObject({ ok: true, data: expect.arrayContaining(['USD', 'EUR']) });
    });
  });

  it('supports persisted private keys and rejects raw keys passed as wallet paths', async () => {
    await withTempHome(async () => {
      const rawKey = '0x8f2a55949024377f59ffcb76953361d492af6f9d932c8f3aef0f0cbce4e3d4c0';
      const setPrivateKey = await run(['config', 'set'], { key: 'private-key', value: rawKey });
      expect(setPrivateKey).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          privateKey: '0x8f2a...4c0',
          walletAddress: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
        }),
      });

      const walletPathError = await run(['config', 'set'], { key: 'wallet', value: rawKey });
      expect(walletPathError).toMatchObject({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Config key wallet expects a file path, not a raw private key. Use `peer config set private-key <hex>` instead.',
        },
      });
    });
  });

  it('masks secrets in config show output', async () => {
    await withTempHome(async () => {
      const rawKey = '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e';
      await writeStoredConfig({
        apiKey: 'stored-api-key-123',
        marketApiKey: 'stored-market-key-456',
        payApiKey: 'stored-pay-key-789',
      });

      const runtime = createMockRuntime({
        config: {
          privateKey: rawKey,
          apiKey: 'flag-api-key-123',
          indexerKey: 'flag-indexer-key-456',
          marketApiKey: 'flag-market-key-789',
          payApiKey: 'flag-pay-key-000',
        },
      });

      const show = await run(['config', 'show'], {}, runtime);
      expect(show).toMatchObject({
        ok: true,
        data: {
          stored: {
            apiKey: 'stored-a...',
            marketApiKey: 'stored-m...',
            payApiKey: 'stored-p...',
          },
          resolved: expect.objectContaining({
            privateKey: '0x59c6...12e',
            apiKey: 'flag-api...',
            indexerKey: 'flag-ind...',
            marketApiKey: 'flag-mar...',
            payApiKey: 'flag-pay...',
            walletAddress: expect.stringMatching(/^0x/),
          }),
        },
      });

      const serialized = JSON.stringify(show);
      expect(serialized).not.toContain(rawKey);
      expect(serialized).not.toContain('stored-api-key-123');
      expect(serialized).not.toContain('stored-market-key-456');
      expect(serialized).not.toContain('stored-pay-key-789');
      expect(serialized).not.toContain('flag-api-key-123');
      expect(serialized).not.toContain('flag-indexer-key-456');
      expect(serialized).not.toContain('flag-market-key-789');
      expect(serialized).not.toContain('flag-pay-key-000');
    });
  });
});
