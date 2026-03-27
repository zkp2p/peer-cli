import { vi } from 'vitest';
import type { CommandDefinition, CommandExecutionContext, PreparedExecutionResult, RuntimeDeps } from '../../src/commands/framework.js';
import type { ClientBundle } from '../../src/sdk/client.js';
import type { GlobalOptions, ResolvedConfig } from '../../src/sdk/config.js';

export interface ProxyCall {
  path: string;
  args: unknown[];
}

export interface MockRuntimeOptions {
  config?: Partial<ResolvedConfig>;
  globalOptions?: GlobalOptions;
  yes?: boolean;
  accountAddress?: `0x${string}`;
  behaviors?: Record<string, unknown>;
  requestJson?: (url: string, options?: RequestInit) => Promise<unknown>;
  readTextFile?: (path: string) => Promise<string>;
  writeJsonFile?: (path: string, value: unknown) => Promise<void>;
  spec?: CommandDefinition;
}

export interface MockRuntimeHarness {
  context: CommandExecutionContext;
  deps: RuntimeDeps;
  bundle: ClientBundle;
  calls: ProxyCall[];
  runPrepared: CommandExecutionContext['runPrepared'];
  requestJson: RuntimeDeps['requestJson'];
  readTextFile: (path: string) => Promise<string>;
  writeJsonFile: (path: string, value: unknown) => Promise<void>;
  config: ResolvedConfig;
  preparedResults: PreparedExecutionResult[];
}

const DEFAULT_ADDRESS = '0x1111111111111111111111111111111111111111';

function createProxy(root: string, behaviors: Record<string, unknown>, calls: ProxyCall[], account?: { address: `0x${string}` }) {
  const callable = function noop() {};

  return new Proxy(callable, {
    get(_target, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'prepare') {
        return async () => ({
          prepared: {
            to: DEFAULT_ADDRESS,
            data: '0x',
            value: 0n,
            chainId: 8453,
          },
        });
      }
      if (prop === 'account') return account;
      if (typeof prop === 'symbol') return undefined;

      const path = root ? `${root}.${prop}` : String(prop);
      if (Object.prototype.hasOwnProperty.call(behaviors, path)) {
        const value = behaviors[path];
        if (typeof value === 'function') {
          const wrapped = (...args: unknown[]) => {
            calls.push({ path, args });
            return (value as (...innerArgs: unknown[]) => unknown)(...args);
          };
          if (typeof (value as { prepare?: unknown }).prepare === 'function') {
            (wrapped as { prepare?: unknown }).prepare = (value as unknown as { prepare: (...innerArgs: unknown[]) => unknown }).prepare;
          }
          return wrapped;
        }
        return value;
      }

      return createProxy(path, behaviors, calls, account);
    },
    apply(_target, _thisArg, args) {
      calls.push({ path: root, args });
      const value = behaviors[root];
      if (typeof value === 'function') {
        return (value as (...innerArgs: unknown[]) => unknown)(...args);
      }
      if (root.startsWith('prepare')) {
        return {
          prepared: {
            to: DEFAULT_ADDRESS,
            data: '0x',
            value: 0n,
            chainId: 8453,
          },
          depositDetails: { draft: true },
        };
      }
      return value ?? { path: root, args };
    },
  });
}

export function createMockRuntime(options: MockRuntimeOptions = {}): MockRuntimeHarness {
  const calls: ProxyCall[] = [];
  const accountAddress = options.accountAddress ?? DEFAULT_ADDRESS;
  const behaviors = {
    getUsdcAddress: () => DEFAULT_ADDRESS,
    getDeployedAddresses: () => ({ escrowV2: DEFAULT_ADDRESS, escrow: DEFAULT_ADDRESS }),
    supportsInlineOracleRateConfig: () => true,
    getQuote: () => [{ route: 'fast', price: '1.23' }],
    getTakerTier: () => ({ responseObject: { tier: 'standard' } }),
    getAccountDeposits: () => [{ id: '1' }],
    getDeposits: () => [{ id: '1' }],
    getAccountIntents: () => [{ hash: '0x1' }],
    getIntents: () => [{ hash: '0x1' }],
    getDeposit: () => ({ id: '1' }),
    getDepositsById: () => [{ id: '1' }],
    getPvDepositById: () => ({ id: '1' }),
    getPvDepositsFromIds: () => [{ id: '1' }],
    getPvAccountDeposits: () => [{ id: '1' }],
    'publicClient.readContract': (params?: { functionName?: string }) => {
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
    'walletClient.sendTransaction': () => '0xsent',
    ensureAllowance: () => ({ ok: true }),
    ...options.behaviors,
  };
  const client = createProxy('', behaviors, calls) as unknown as ClientBundle['client'];
  const publicClient = createProxy('publicClient', behaviors, calls) as unknown as ClientBundle['publicClient'];
  const walletClient = createProxy('walletClient', behaviors, calls, { address: accountAddress }) as unknown as ClientBundle['walletClient'];
  const bundle: ClientBundle = { client, publicClient, walletClient };

  const defaults: ResolvedConfig = {
    env: 'production',
    format: 'json',
    yes: false,
    debug: false,
    walletPath: undefined,
    rpcUrl: 'https://mainnet.base.org',
    apiKey: undefined,
    indexerKey: undefined,
    indexerUrl: undefined,
    marketApiKey: undefined,
    payApiKey: undefined,
    baseApiUrl: 'https://api.zkp2p.xyz',
    marketBaseUrl: 'https://peerlytics.xyz/api/',
    payBaseUrl: 'https://api.pay.zkp2p.xyz',
    privateKey: undefined,
  };
  const baseConfig: ResolvedConfig = {
    ...defaults,
    ...options.config,
    yes: options.yes ?? options.config?.yes ?? false,
  };

  const requestJson = vi.fn(options.requestJson ?? (async (url: string, requestOptions?: RequestInit) => ({ url, options: requestOptions }))) as unknown as RuntimeDeps['requestJson'];
  const readTextFile = vi.fn(options.readTextFile ?? (async () => '{}'));
  const writeJsonFile = vi.fn(options.writeJsonFile ?? (async () => undefined));
  const preparedResults: Array<PreparedExecutionResult<unknown, unknown>> = [];

  const runPrepared = vi.fn(async (plan: { description?: string; prepare: () => Promise<{ prepared: { to: string; data: string; value: bigint; chainId: number }; previewData?: unknown }>; execute: () => Promise<unknown> }) => {
    const prepared = await plan.prepare();
    const preview = {
      to: prepared.prepared.to,
      data: prepared.prepared.data,
      value: prepared.prepared.value.toString(),
      chainId: prepared.prepared.chainId,
      description: plan.description,
    };

    if (baseConfig.yes) {
      const result = await plan.execute();
      const value = { executed: true, preview, previewData: prepared.previewData, result } as PreparedExecutionResult<unknown, unknown>;
      preparedResults.push(value);
      return value;
    }

    const value = { executed: false, preview, previewData: prepared.previewData } as PreparedExecutionResult<unknown, unknown>;
    preparedResults.push(value);
    return value;
  }) as CommandExecutionContext['runPrepared'];

  const deps: RuntimeDeps = {
    createClient: vi.fn(async () => bundle),
    resolveConfig: vi.fn(async (globalOptions) => ({
      ...baseConfig,
      env: globalOptions.env ?? baseConfig.env,
      format: globalOptions.format ?? baseConfig.format,
      yes: Boolean(globalOptions.yes ?? globalOptions.execute ?? baseConfig.yes),
      debug: Boolean(globalOptions.debug ?? baseConfig.debug),
      privateKey: globalOptions.privateKey ?? baseConfig.privateKey,
      walletPath: globalOptions.walletPath ?? baseConfig.walletPath,
      rpcUrl: globalOptions.rpcUrl ?? baseConfig.rpcUrl,
      apiKey: globalOptions.apiKey ?? baseConfig.apiKey,
      indexerKey: globalOptions.indexerKey ?? baseConfig.indexerKey,
      indexerUrl: globalOptions.indexerUrl ?? baseConfig.indexerUrl,
      marketApiKey: globalOptions.marketApiKey ?? baseConfig.marketApiKey,
      payApiKey: globalOptions.payApiKey ?? baseConfig.payApiKey,
      baseApiUrl: globalOptions.baseApiUrl ?? baseConfig.baseApiUrl,
      marketBaseUrl: globalOptions.marketBaseUrl ?? baseConfig.marketBaseUrl,
      payBaseUrl: globalOptions.payBaseUrl ?? baseConfig.payBaseUrl,
    })),
    requestJson,
  };

  const spec = options.spec ?? {
    path: ['test'],
    description: 'test',
    readOnly: true,
    handler: async () => undefined,
  };

  const context: CommandExecutionContext = {
    spec,
    command: `peer ${spec.path.join(' ')}`,
    config: baseConfig,
    globalOptions: options.globalOptions ?? {},
    deps,
    getClient: vi.fn(async () => bundle),
    requestJson,
    readJsonFile: async () => undefined,
    readTextFile,
    writeJsonFile,
    runPrepared,
  };

  return {
    context,
    deps,
    bundle,
    calls,
    runPrepared,
    requestJson,
    readTextFile,
    writeJsonFile,
    config: baseConfig,
    preparedResults,
  } as MockRuntimeHarness;
}
