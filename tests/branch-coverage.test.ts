import { describe, expect, it, vi } from 'vitest';
import { getRateManagerContracts, resolveFiatCurrencyBytes32, resolvePaymentMethodHash } from '@zkp2p/sdk';
import type { CommandExecutionContext, RuntimeDeps } from '../src/commands/framework.js';
import { commandDefinitions } from '../src/commands/registry.js';
import type { ClientBundle } from '../src/sdk/client.js';
import { getCheckoutCachePath, type ResolvedConfig } from '../src/sdk/config.js';
import type { RequestJsonOptions } from '../src/utils/http.js';
import { DEFAULT_CHAIN_ID } from '../src/utils/constants.js';

vi.mock('@zkp2p/sdk', () => ({
  getRateManagerContracts: vi.fn(() => ({
    addresses: {
      registry: '0x5555555555555555555555555555555555555555',
    },
  })),
  resolvePaymentMethodHash: vi.fn(() => '0x3333333333333333333333333333333333333333'),
  resolveFiatCurrencyBytes32: vi.fn(() => '0x4444444444444444444444444444444444444444'),
  validateOracleFeedsOnChain: vi.fn(async () => ['feed-ok']),
}));

const DEFAULT_ADDRESS = '0x1111111111111111111111111111111111111111';
const ALT_TOKEN = '0x2222222222222222222222222222222222222222';

type QuoteResult = Array<{ args: Array<{ isExactFiat?: boolean; destinationToken?: string }> }>;

type PreparedCallResult = {
  path: string;
  args: unknown[];
  result: unknown;
};

type PreparedMethod = ((...args: unknown[]) => Promise<PreparedCallResult>) & {
  prepare: () => Promise<{
    prepared: {
      to: string;
      data: string;
      value: bigint;
      chainId: number;
    };
  }>;
};

type RequestJsonStub = (url: string, options?: RequestJsonOptions) => Promise<unknown>;

interface BranchCoverageRuntime {
  deps: RuntimeDeps;
  context: CommandExecutionContext;
  written: Array<{ path: string; value: unknown }>;
  cache: Record<string, string>;
  config: ResolvedConfig;
  bundle: ClientBundle;
}

function lookup(path: string[]): (typeof commandDefinitions)[number] {
  const spec = commandDefinitions.find((entry) => entry.path.join(' ') === path.join(' '));
  if (!spec) {
    throw new Error(`Missing definition: ${path.join(' ')}`);
  }
  return spec;
}

function makePreparedMethod(name: string, result: unknown = { path: name }): PreparedMethod {
  return Object.assign(
    async (...args: unknown[]) => ({ path: name, args, result }),
    {
      prepare: async () => ({
        prepared: {
          to: DEFAULT_ADDRESS,
          data: '0x',
          value: 0n,
          chainId: DEFAULT_CHAIN_ID,
        },
      }),
    },
  );
}

function makeContext(options: {
  yes?: boolean;
  payApiKey?: string;
  walletAddress?: `0x${string}`;
  getUsdcAddress?: () => `0x${string}` | undefined;
    requestJson?: RequestJsonStub;
  cache?: Record<string, string>;
} = {}): BranchCoverageRuntime {
  const cache = options.cache ?? {};
  const written: Array<{ path: string; value: unknown }> = [];
  const requestJson = (options.requestJson ?? (async <T>(url: string) => ({ url } as T))) as RuntimeDeps['requestJson'];

  const client = {
    getQuote: async (...args: unknown[]) => [{ route: 'fast', args }],
    getUsdcAddress: options.getUsdcAddress ?? (() => DEFAULT_ADDRESS),
    getDeployedAddresses: () => ({ escrowV2: DEFAULT_ADDRESS, escrow: DEFAULT_ADDRESS }),
    ensureAllowance: async (...args: unknown[]) => ({ path: 'ensureAllowance', args }),
    getAccountDeposits: async (owner: string) => [{ owner }],
    getDeposits: async () => [{ id: 'all' }],
    getDeposit: async (...args: unknown[]) => ({ path: 'getDeposit', args }),
    getDepositsById: async (...args: unknown[]) => ({ path: 'getDepositsById', args }),
    registerPayeeDetails: async (...args: unknown[]) => ({ path: 'registerPayeeDetails', args }),
    resolvePayeeHash: async (...args: unknown[]) => ({ path: 'resolvePayeeHash', args }),
    signalIntent: makePreparedMethod('signalIntent'),
    getAccountIntents: async (owner: string) => [{ owner }],
    getIntents: async () => [{ hash: '0x1' }],
    getIntent: async (...args: unknown[]) => ({ path: 'getIntent', args }),
    cancelIntent: makePreparedMethod('cancelIntent'),
    fulfillIntent: makePreparedMethod('fulfillIntent'),
    releaseFundsToPayer: makePreparedMethod('releaseFundsToPayer'),
    getFulfillIntentInputs: async (...args: unknown[]) => ({ path: 'getFulfillIntentInputs', args }),
    cleanupOrphanedIntents: makePreparedMethod('cleanupOrphanedIntents'),
    setDepositPreIntentHook: makePreparedMethod('setDepositPreIntentHook'),
    setDepositWhitelistHook: makePreparedMethod('setDepositWhitelistHook'),
    getDepositPreIntentHook: async (...args: unknown[]) => ({ path: 'getDepositPreIntentHook', args }),
    getDepositWhitelistHook: async (...args: unknown[]) => ({ path: 'getDepositWhitelistHook', args }),
    createRateManager: makePreparedMethod('createRateManager'),
    supportsInlineOracleRateConfig: () => true,
    setVaultMinRate: makePreparedMethod('setVaultMinRate'),
    setVaultMinRatesBatch: makePreparedMethod('setVaultMinRatesBatch'),
    getRateManagers: async (...args: unknown[]) => ({ path: 'getRateManagers', args }),
    getRateManagerDetail: async (...args: unknown[]) => ({ path: 'getRateManagerDetail', args }),
    getRateManagerDelegations: async (...args: unknown[]) => ({ path: 'getRateManagerDelegations', args }),
    getManagerDailySnapshots: async (...args: unknown[]) => ({ path: 'getManagerDailySnapshots', args }),
    getManualRateUpdates: async (...args: unknown[]) => ({ path: 'getManualRateUpdates', args }),
    getOracleConfigUpdates: async (...args: unknown[]) => ({ path: 'getOracleConfigUpdates', args }),
    setVaultFee: makePreparedMethod('setVaultFee'),
    setVaultConfig: makePreparedMethod('setVaultConfig'),
    getManagerFee: async (...args: unknown[]) => ({ path: 'getManagerFee', args }),
    getEffectiveRate: async (...args: unknown[]) => ({ path: 'getEffectiveRate', args }),
    setDepositRateManager: makePreparedMethod('setDepositRateManager'),
    clearDepositRateManager: makePreparedMethod('clearDepositRateManager'),
    getDepositRateManager: async (...args: unknown[]) => ({ path: 'getDepositRateManager', args }),
    setRateManager: makePreparedMethod('setRateManager'),
    clearRateManager: makePreparedMethod('clearRateManager'),
    getDelegationForDeposit: async (...args: unknown[]) => ({ path: 'getDelegationForDeposit', args }),
    getIntentsForDeposits: async (...args: unknown[]) => ({ path: 'getIntentsForDeposits', args }),
    getOwnerIntents: async (...args: unknown[]) => ({ path: 'getOwnerIntents', args }),
    getIntentByHash: async (...args: unknown[]) => ({ path: 'getIntentByHash', args }),
    getExpiredIntents: async (...args: unknown[]) => ({ path: 'getExpiredIntents', args }),
    getFulfilledIntentEvents: async (...args: unknown[]) => ({ path: 'getFulfilledIntentEvents', args }),
    getIntentFulfillmentAmounts: async (...args: unknown[]) => ({ path: 'getIntentFulfillmentAmounts', args }),
    getFulfillmentAndPayment: async (...args: unknown[]) => ({ path: 'getFulfillmentAndPayment', args }),
  };

  const bundle: ClientBundle = {
    client: client as unknown as ClientBundle['client'],
    publicClient: {
      readContract: async () => 123n,
    } as unknown as ClientBundle['publicClient'],
    walletClient: {
      account: options.walletAddress === undefined ? undefined : { address: options.walletAddress },
      sendTransaction: async () => '0xsent',
    } as unknown as ClientBundle['walletClient'],
  };

  const config: ResolvedConfig = {
    env: 'production',
    format: 'json',
    yes: options.yes ?? false,
    debug: false,
    walletPath: undefined,
    rpcUrl: 'https://rpc.example',
    apiKey: undefined,
    indexerKey: undefined,
    indexerUrl: undefined,
    marketApiKey: undefined,
    payApiKey: options.payApiKey,
    baseApiUrl: 'https://base.example',
    marketBaseUrl: 'https://market.example',
    payBaseUrl: 'https://pay.example',
    privateKey: undefined,
  };

  const deps: RuntimeDeps = {
    createClient: async () => bundle,
    resolveConfig: async () => config,
    requestJson,
  };

  const context: CommandExecutionContext = {
    spec: lookup(['quote']),
    command: 'peer test',
    config,
    globalOptions: {},
    deps,
    getClient: async () => bundle,
    requestJson,
    readJsonFile: async () => undefined,
    readTextFile: async (path: string) => {
      const value = cache[path];
      if (value !== undefined) {
        return value;
      }
      const error = new Error(`Missing fixture for ${path}`) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    },
    writeJsonFile: async (path: string, value: unknown) => {
      written.push({ path, value });
    },
    runPrepared: async (plan) => {
      const { prepared } = await plan.prepare();
      const preview = {
        to: prepared.to,
        data: prepared.data,
        value: prepared.value.toString(),
        chainId: prepared.chainId,
        description: plan.description,
      };
      if (config.yes) {
        return {
          executed: true,
          preview,
          result: await plan.execute(),
        };
      }
      return { executed: false, preview };
    },
  };

  return {
    deps,
    context,
    written,
    cache,
    config,
    bundle,
  };
}

describe('branch coverage', () => {
  it('covers quote, market, transfer, and checkout alternate paths', async () => {
    const runtime = makeContext({ walletAddress: DEFAULT_ADDRESS });

    const quote = await lookup(['quote']).handler({ from: 'USD', tokenAmount: 5 }, runtime.context);
    expect((quote as QuoteResult)[0]?.args[0]?.isExactFiat).toBe(false);

    const quoteExact = await lookup(['quote']).handler(
      {
        from: 'USD',
        amount: 5,
        platform: 'wise',
        recipient: DEFAULT_ADDRESS,
        user: DEFAULT_ADDRESS,
        to: ALT_TOKEN,
      },
      runtime.context,
    );
    expect((quoteExact as QuoteResult)[0]?.args[0]?.isExactFiat).toBe(true);

    await expect(lookup(['quote']).handler({ from: 'USD' }, runtime.context)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(lookup(['market', 'volume']).handler({ period: '24h', granularity: 'daily' }, runtime.context)).resolves.toEqual({
      url: 'https://market.example/v1/volume?period=1d&granularity=daily',
    });
    await expect(lookup(['market', 'volume']).handler({ period: 'bad', granularity: 'daily' }, runtime.context)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1, token: ALT_TOKEN }, runtime.context)).resolves.toMatchObject({
      executed: false,
      preview: expect.any(Object),
    });

    const noUsdc = makeContext({ getUsdcAddress: () => undefined });
    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1 }, noUsdc.context)).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
    });

    const noWalletTransfer = makeContext({ walletAddress: undefined });
    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1 }, noWalletTransfer.context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });

    const noWallet = makeContext({ payApiKey: 'pay-key', walletAddress: undefined });
    await expect(lookup(['checkout', 'create']).handler({ amount: 12 }, noWallet.context)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    const checkoutCreate = makeContext({
      payApiKey: 'pay-key',
      walletAddress: DEFAULT_ADDRESS,
      requestJson: async <T>() => ({ path: 'checkout.session', orderId: 'order-1' } as T),
    });
    await expect(
      lookup(['checkout', 'create']).handler({ amount: 12, recipient: DEFAULT_ADDRESS, description: 'demo' }, checkoutCreate.context),
    ).resolves.toMatchObject({ path: 'checkout.session' });

    const checkout = makeContext({
      cache: {
        '/root/.peer/checkout-sessions.json': JSON.stringify({
          sessions: { order1: { orderId: 'order1', status: 'fulfilled' } },
        }),
      },
    });
    checkout.context.readTextFile = async () => checkout.cache['/root/.peer/checkout-sessions.json'] ?? '';

    await expect(lookup(['checkout', 'list']).handler({ status: 'completed' }, checkout.context)).resolves.toEqual({
      source: 'cache',
      sessions: [{ orderId: 'order1', status: 'fulfilled' }],
    });
    await expect(lookup(['checkout', 'show']).handler({ sessionId: 'missing' }, checkout.context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('covers vault, intent, and delegate alternates', async () => {
    const runtime = makeContext({ yes: true });

    await expect(
      lookup(['vault', 'create']).handler(
        {
          manager: DEFAULT_ADDRESS,
          feeRecipient: DEFAULT_ADDRESS,
          fee: 1,
          name: 'Vault',
          uri: 'ipfs://demo',
          depositHook: DEFAULT_ADDRESS,
          minLiquidity: 1,
        },
        runtime.context,
      ),
    ).resolves.toMatchObject({ executed: true });

    await expect(lookup(['vault', 'set-rate']).handler({ id: '7', platform: 'wise', currency: 'USD', rate: 1.5 }, runtime.context)).resolves.toMatchObject({
      executed: true,
      result: { path: 'setVaultMinRate' },
    });
    await expect(lookup(['vault', 'set-rate']).handler({ id: '7', platform: DEFAULT_ADDRESS, currency: ALT_TOKEN, rate: 1.5 }, runtime.context)).resolves.toMatchObject({
      executed: true,
    });
    expect(resolvePaymentMethodHash).toHaveBeenCalled();
    expect(resolveFiatCurrencyBytes32).toHaveBeenCalled();

    await expect(lookup(['oracle', 'supports-inline']).handler({ escrowAddress: DEFAULT_ADDRESS }, runtime.context)).resolves.toBe(true);
    await expect(lookup(['oracle', 'validate-feeds']).handler({}, runtime.context)).resolves.toEqual(['feed-ok']);

    await expect(
      lookup(['intent', 'create']).handler(
        {
          deposit: '1',
          amount: 2,
          platform: 'wise',
          currency: 'USD',
          to: DEFAULT_ADDRESS,
          rate: 1.2,
          payeeDetails: 'details',
          processorIntentData: { nested: true },
        },
        runtime.context,
      ),
    ).resolves.toMatchObject({ executed: true });
    await expect(lookup(['intent', 'list']).handler({ owner: DEFAULT_ADDRESS }, runtime.context)).resolves.toEqual([{ owner: DEFAULT_ADDRESS }]);
    await expect(lookup(['intent', 'list']).handler({}, runtime.context)).resolves.toEqual([{ hash: '0x1' }]);
    await expect(lookup(['intent', 'fulfill']).handler({ hash: '0xhash', proof: '{"proof":true}' }, runtime.context)).resolves.toMatchObject({ executed: true });
    await expect(lookup(['intent', 'fulfill']).handler({ hash: '0xhash', precomputedAttestation: '{"attested":true}' }, runtime.context)).resolves.toMatchObject({ executed: true });
    await expect(
      lookup(['delegate', 'set']).handler({ deposit: '7', vault: 'vault-1', escrow: DEFAULT_ADDRESS, registry: DEFAULT_ADDRESS }, runtime.context),
    ).resolves.toMatchObject({ executed: true });
    await expect(lookup(['delegate', 'set']).handler({ deposit: '7', vault: 'vault-1' }, runtime.context)).resolves.toMatchObject({ executed: true });
    await expect(lookup(['delegate', 'show']).handler({ deposit: '7' }, runtime.context)).resolves.toMatchObject({
      path: 'getDepositRateManager',
    });
  });

  it('covers checkout cache and api-key edge cases', async () => {
    const list = lookup(['checkout', 'list']);
    const create = lookup(['checkout', 'create']);
    const show = lookup(['checkout', 'show']);
    const cachePath = getCheckoutCachePath();

    const emptyCache = makeContext({ walletAddress: DEFAULT_ADDRESS });
    emptyCache.context.readTextFile = async () => {
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    };
    await expect(list.handler({}, emptyCache.context)).resolves.toEqual({ source: 'cache', sessions: [] });

    const brokenCache = makeContext({ walletAddress: DEFAULT_ADDRESS });
    brokenCache.context.readTextFile = async () => {
      throw new Error('boom');
    };
    await expect(list.handler({}, brokenCache.context)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });

    const cached = makeContext({
      cache: {
        [cachePath]: JSON.stringify({
          sessions: {
            order1: { orderId: 'order1', state: 'created' },
            order2: { orderId: 'order2', status: 'fulfilled' },
          },
        }),
      },
    });
    cached.context.readTextFile = async () => cached.cache[cachePath] ?? '';

    await expect(list.handler({ status: 'pending' }, cached.context)).resolves.toEqual({
      source: 'cache',
      sessions: [{ orderId: 'order1', state: 'created' }],
    });
    await expect(list.handler({ status: 'completed' }, cached.context)).resolves.toEqual({
      source: 'cache',
      sessions: [{ orderId: 'order2', status: 'fulfilled' }],
    });
    const blankStatus = await list.handler({ status: '' }, cached.context);
    expect(blankStatus).toEqual({
      source: 'cache',
      sessions: expect.arrayContaining([
        { orderId: 'order1', state: 'created' },
        { orderId: 'order2', status: 'fulfilled' },
      ]),
    });

    await expect(create.handler({ amount: 1, description: 'demo' }, makeContext({ walletAddress: DEFAULT_ADDRESS }).context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });

    const created = makeContext({
      payApiKey: 'pay-key',
      walletAddress: DEFAULT_ADDRESS,
      requestJson: async () => ({ status: 'created' }),
    });
    await expect(create.handler({ amount: 1, description: 'demo' }, created.context)).resolves.toEqual({ status: 'created' });
    expect(created.written).toHaveLength(0);

    const showPersist = makeContext({
      payApiKey: 'pay-key',
      walletAddress: DEFAULT_ADDRESS,
      requestJson: async () => ({ status: 'ok' }),
    });
    await expect(show.handler({ sessionId: 'abc' }, showPersist.context)).resolves.toEqual({ status: 'ok' });
    expect(showPersist.written).toHaveLength(1);
    expect(showPersist.written[0]?.path).toContain('checkout-sessions.json');
    expect(showPersist.written[0]?.value).toMatchObject({
      sessions: {
        abc: { orderId: 'abc', status: 'ok' },
      },
    });
  });

  it('covers quote, market, intent, and delegate edge branches', async () => {
    const quoteRuntime = makeContext({
      walletAddress: DEFAULT_ADDRESS,
      getUsdcAddress: () => ALT_TOKEN,
    });
    const quoteUsdc = await lookup(['quote']).handler({ from: 'USD', amount: 5, to: 'USDC' }, quoteRuntime.context);
    expect((quoteUsdc as QuoteResult)[0]?.args[0]?.destinationToken).toBe(ALT_TOKEN);

    await expect(lookup(['market', 'compare']).handler({ from: 'USD', amount: 10 }, makeContext({ walletAddress: undefined }).context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    await expect(lookup(['market', 'volume']).handler({ period: '7d', granularity: 'daily' }, quoteRuntime.context)).resolves.toEqual({
      url: 'https://market.example/v1/volume?period=7d&granularity=daily',
    });

    const runtime = makeContext({ yes: true });
    await expect(lookup(['intent', 'cleanup-orphaned']).handler({ hashes: ['0x1', '0x2'] }, runtime.context)).resolves.toMatchObject({ executed: true });
    await expect(
      lookup(['intent', 'fulfill']).handler(
        { hash: '0xhash', proof: { proof: true }, precomputedAttestation: { attested: true } },
        runtime.context,
      ),
    ).resolves.toMatchObject({ executed: true });

    const delegateRuntime = makeContext({ yes: true });
    delegateRuntime.context.config.env = 'staging';
    delegateRuntime.bundle.client.getDeployedAddresses = (() => ({ escrow: DEFAULT_ADDRESS })) as unknown as ClientBundle['client']['getDeployedAddresses'];
    await expect(lookup(['delegate', 'set']).handler({ deposit: '7', vault: 'vault-1' }, delegateRuntime.context)).resolves.toMatchObject({
      executed: true,
    });
    expect(getRateManagerContracts).toHaveBeenCalledWith(DEFAULT_CHAIN_ID, 'staging');
  });
});
