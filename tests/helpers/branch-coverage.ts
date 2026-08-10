import { vi } from 'vitest';
import type { CommandExecutionContext, RuntimeDeps } from '../../src/commands/framework.js';
import { commandDefinitions } from '../../src/commands/registry.js';
import type { ClientBundle } from '../../src/sdk/client.js';
import type { ResolvedConfig } from '../../src/sdk/config.js';
import type { RequestJsonOptions } from '../../src/utils/http.js';
import { DEFAULT_CHAIN_ID } from '../../src/utils/constants.js';

const sdkMocks = vi.hoisted(() => ({
  getRateManagerContracts: vi.fn(() => ({
    addresses: {
      registry: '0x5555555555555555555555555555555555555555',
    },
  })),
  resolvePaymentMethodHash: vi.fn(() => '0x3333333333333333333333333333333333333333'),
  resolveFiatCurrencyBytes32: vi.fn(() => '0x4444444444444444444444444444444444444444'),
  validateOracleFeedsOnChain: vi.fn(async () => ['feed-ok']),
}));

vi.mock('@zkp2p/sdk', () => sdkMocks);

export const { getRateManagerContracts, resolveFiatCurrencyBytes32, resolvePaymentMethodHash } = sdkMocks;

export const DEFAULT_ADDRESS = '0x1111111111111111111111111111111111111111';
export const ALT_TOKEN = '0x2222222222222222222222222222222222222222';
const ORCHESTRATOR_V3_ADDRESS = '0x3333333333333333333333333333333333333333';

export type QuoteResult = Array<{
  args: Array<{ amount?: string; isExactFiat?: boolean; destinationToken?: string }>;
}>;

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

export interface BranchCoverageRuntime {
  deps: RuntimeDeps;
  context: CommandExecutionContext;
  written: Array<{ path: string; value: unknown }>;
  cache: Record<string, string>;
  config: ResolvedConfig;
  bundle: ClientBundle;
}

export function lookup(path: string[]): (typeof commandDefinitions)[number] {
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

export function makeContext(options: {
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
    getDeployedAddresses: () => ({
      escrowV2: DEFAULT_ADDRESS,
      escrow: DEFAULT_ADDRESS,
      orchestratorV3: ORCHESTRATOR_V3_ADDRESS,
    }),
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
    getDepositPreIntentHook: async (...args: unknown[]) => ({ path: 'getDepositPreIntentHook', args }),
    createRateManager: makePreparedMethod('createRateManager'),
    supportsInlineOracleRateConfig: () => true,
    setVaultMinRate: makePreparedMethod('setVaultMinRate'),
    setVaultMinRatesBatch: makePreparedMethod('setVaultMinRatesBatch'),
    indexer: {
      getRateManagers: async () => [
        {
          manager: {
            rateManagerId: '0xabc123',
            manager: DEFAULT_ADDRESS,
            feeRecipient: DEFAULT_ADDRESS,
            fee: '1000000000000000',
            maxFee: '20000000000000000',
            name: 'Test Vault',
            uri: '',
            createdAt: '1700000000',
            updatedAt: '1700000000',
          },
          aggregate: {
            currentDelegatedDeposits: 2,
            currentDelegatedBalance: '1000000',
            totalFilledVolume: '5000000',
            totalPnlUsdCents: '100',
            fulfilledIntents: 5,
          },
        },
      ],
      getRateManagerDetail: async () => null,
      getRateManagerDelegations: async (...args: unknown[]) => ({ path: 'getRateManagerDelegations', args }),
      getManagerDailySnapshots: async (...args: unknown[]) => ({ path: 'getManagerDailySnapshots', args }),
      getManualRateUpdates: async (...args: unknown[]) => ({ path: 'getManualRateUpdates', args }),
      getOracleConfigUpdates: async (...args: unknown[]) => ({ path: 'getOracleConfigUpdates', args }),
      getIntentsForDeposits: async (...args: unknown[]) => ({ path: 'getIntentsForDeposits', args }),
      getOwnerIntents: async (...args: unknown[]) => ({ path: 'getOwnerIntents', args }),
      getIntentByHash: async (...args: unknown[]) => ({ path: 'getIntentByHash', args }),
      getExpiredIntents: async (...args: unknown[]) => ({ path: 'getExpiredIntents', args }),
      getFulfilledIntentEvents: async (...args: unknown[]) => ({ path: 'getFulfilledIntentEvents', args }),
      getIntentFulfillmentAmounts: async (...args: unknown[]) => ({ path: 'getIntentFulfillmentAmounts', args }),
      getFulfillmentAndPayment: async (...args: unknown[]) => ({ path: 'getFulfillmentAndPayment', args }),
      getDelegationForDeposit: async (...args: unknown[]) => ({ path: 'getDelegationForDeposit', args }),
      getDepositsWithRelations: async (...args: unknown[]) => ({ path: 'getDepositsWithRelations', args }),
      getDepositById: async (...args: unknown[]) => ({ path: 'getDepositById', args }),
    },
    // deposit prepare/create
    prepareCreateDeposit: async () => ({
      prepared: { to: DEFAULT_ADDRESS, data: '0x', value: 0n, chainId: 8453 },
      depositDetails: { depositId: 1 },
    }),
    createDeposit: async () => ({ txHash: '0xcreated' }),
    // deposit mutations
    addFunds: makePreparedMethod('addFunds'),
    removeFunds: makePreparedMethod('removeFunds'),
    withdrawDeposit: makePreparedMethod('withdrawDeposit'),
    setAcceptingIntents: makePreparedMethod('setAcceptingIntents'),
    setIntentRange: makePreparedMethod('setIntentRange'),
    setCurrencyMinRate: makePreparedMethod('setCurrencyMinRate'),
    setRetainOnEmpty: makePreparedMethod('setRetainOnEmpty'),
    setDelegate: makePreparedMethod('setDelegate'),
    removeDelegate: makePreparedMethod('removeDelegate'),
    addPaymentMethods: makePreparedMethod('addPaymentMethods'),
    setPaymentMethodActive: makePreparedMethod('setPaymentMethodActive'),
    removePaymentMethod: makePreparedMethod('removePaymentMethod'),
    addCurrencies: makePreparedMethod('addCurrencies'),
    deactivateCurrency: makePreparedMethod('deactivateCurrency'),
    removeCurrency: makePreparedMethod('removeCurrency'),
    pruneExpiredIntents: makePreparedMethod('pruneExpiredIntents'),
    setOracleRateConfig: makePreparedMethod('setOracleRateConfig'),
    removeOracleRateConfig: makePreparedMethod('removeOracleRateConfig'),
    setOracleRateConfigBatch: makePreparedMethod('setOracleRateConfigBatch'),
    updateCurrencyConfigBatch: makePreparedMethod('updateCurrencyConfigBatch'),
    deactivateCurrenciesBatch: makePreparedMethod('deactivateCurrenciesBatch'),
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
  };

  const bundle: ClientBundle = {
    client: client as unknown as ClientBundle['client'],
    publicClient: {
      readContract: async (params?: { functionName?: string }) => {
        switch (params?.functionName) {
          case 'decimals':
            return 6;
          case 'allowance':
          case 'balanceOf':
            return 123n;
          default:
            return 123n;
        }
      },
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
    marketBaseUrl: 'https://market.example/',
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
