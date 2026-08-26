/**
 * Targeted coverage tests to close every remaining gap.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_ADDRESS,
  lookup,
  makeContext,
} from './helpers/branch-coverage.js';
import { createMockRuntime } from './helpers/mock-runtime.js';
import { executeDefinition } from '../src/commands/framework.js';
import { commandDefinitions } from '../src/commands/registry.js';
import { resolvePrivateKey } from '../src/sdk/wallet.js';
import { readPackageVersion } from '../src/utils/package.js';
import { runCliInProcess } from './helpers/cli-runner.js';

const previousHome = process.env.HOME;

afterEach(() => {
  process.env.HOME = previousHome;
  vi.restoreAllMocks();
});

function definition(path: string[]) {
  const spec = commandDefinitions.find((entry) => entry.path.join(' ') === path.join(' '));
  if (!spec) throw new Error(`Missing: ${path.join(' ')}`);
  return spec;
}

async function run(path: string[], input: Record<string, unknown>, runtime = createMockRuntime()) {
  return executeDefinition(definition(path), input, {} as never, runtime.deps);
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'peer-cli-cov100-'));
  process.env.HOME = home;
  return fn(home);
}

// --- wallet.ts: line 19-20 (JSON wallet file) ---
describe('wallet.ts coverage', () => {
  it('reads private key from JSON wallet file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-wallet-'));
    const walletPath = join(dir, 'wallet.json');
    await writeFile(walletPath, JSON.stringify({ privateKey: '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e' }));
    const key = await resolvePrivateKey({ walletPath, env: 'production', format: 'json', yes: false, debug: false }, false);
    expect(key).toBe('0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e');
  });

  it('reads raw hex key from plain text wallet file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-wallet-'));
    const walletPath = join(dir, 'wallet.txt');
    await writeFile(walletPath, '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e\n');
    const key = await resolvePrivateKey({ walletPath, env: 'production', format: 'json', yes: false, debug: false }, false);
    expect(key).toBe('0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e');
  });
});

// --- package.ts: lines 33-58 (fallback/error paths) ---
describe('package.ts coverage', () => {
  it('returns fallback when no matching package.json found', async () => {
    const origCwd = process.cwd;
    const origArgv = process.argv[1]!;
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-pkg-'));
    process.cwd = () => dir;
    process.argv[1] = join(dir, 'bin', 'cli.js');
    try {
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const version = readPackageVersion();
      expect(version).toBe('0.1.0');
      expect(spy).toHaveBeenCalled();
    } finally {
      process.cwd = origCwd;
      process.argv[1] = origArgv;
    }
  });

  it('uses fallback version from non-matching package.json', async () => {
    const origCwd = process.cwd;
    const origArgv = process.argv[1]!;
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-pkg-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'other-package', version: '9.9.9' }));
    process.cwd = () => dir;
    process.argv[1] = join(dir, 'bin', 'cli.js');
    try {
      const version = readPackageVersion();
      expect(version).toBe('9.9.9');
    } finally {
      process.cwd = origCwd;
      process.argv[1] = origArgv;
    }
  });

  it('skips package.json without version field', async () => {
    const origCwd = process.cwd;
    const origArgv = process.argv[1]!;
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-pkg-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'no-version' }));
    process.cwd = () => dir;
    process.argv[1] = join(dir, 'bin', 'cli.js');
    try {
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const version = readPackageVersion();
      expect(version).toBe('0.1.0');
      expect(spy).toHaveBeenCalled();
    } finally {
      process.cwd = origCwd;
      process.argv[1] = origArgv;
    }
  });
});

// --- mcp.ts: handler (lines 16-23) ---
describe('mcp.ts coverage', () => {
  it('calls startPeerMcpServer when handler is invoked', async () => {
    const runtime = makeContext();
    const handler = lookup(['mcp']).handler;
    const serverModule = await import('../src/mcp/server.js');
    vi.spyOn(serverModule, 'startPeerMcpServer').mockResolvedValue(undefined as never);
    const result = await handler({ profile: 'full' }, runtime.context);
    expect(result).toBeUndefined();
  });

  it('starts read-only Streamable HTTP with validated bind options', async () => {
    const runtime = makeContext();
    const handler = lookup(['mcp']).handler;
    const serverModule = await import('../src/mcp/server.js');
    const startHttp = vi
      .spyOn(serverModule, 'startPeerMcpHttpServer')
      .mockResolvedValue(undefined as never);

    await expect(
      handler(
        { profile: 'read-only', transport: 'http', host: '0.0.0.0', port: 8787 },
        runtime.context,
      ),
    ).resolves.toBeUndefined();
    expect(startHttp).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'read-only',
        host: '0.0.0.0',
        port: 8787,
      }),
    );
  });

  it('rejects invalid HTTP ports before starting the server', async () => {
    const runtime = makeContext();
    const handler = lookup(['mcp']).handler;
    await expect(
      handler({ profile: 'read-only', transport: 'http', port: 70_000 }, runtime.context),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// --- quote.ts: lines 26-27 (resolveDestinationToken fallback) ---
describe('quote.ts coverage', () => {
  it('throws CONFIG_ERROR when USDC address unavailable', async () => {
    const runtime = makeContext({ getUsdcAddress: () => undefined as unknown as `0x${string}` });
    await expect(
      lookup(['quote']).handler({ from: 'USD', amount: 10, to: 'USDC' }, runtime.context),
    ).rejects.toMatchObject({ code: 'CONFIG_ERROR' });
  });
});

// --- market.ts: api-key create/rotate/delete auth checks (lines 472, 491-492, 511-512) ---
describe('market api-key auth coverage', () => {
  it('rejects api-key create without market key', async () => {
    const noKeyRuntime = makeContext();
    await expect(
      lookup(['market', 'api-key', 'create']).handler({ label: 'test' }, noKeyRuntime.context),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('rejects api-key rotate without market key', async () => {
    const noKeyRuntime = makeContext();
    await expect(
      lookup(['market', 'api-key', 'rotate']).handler({ key: 'pk_old' }, noKeyRuntime.context),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('rejects api-key delete without market key', async () => {
    const noKeyRuntime = makeContext();
    await expect(
      lookup(['market', 'api-key', 'delete']).handler({ key: 'pk_old' }, noKeyRuntime.context),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});

// --- transfer.ts: lines 100-103 (balance without wallet) ---
describe('transfer.ts coverage', () => {
  it('balance throws AUTH_REQUIRED without wallet or address', async () => {
    const noWallet = makeContext({ walletAddress: undefined as unknown as `0x${string}` });
    await expect(
      lookup(['balance']).handler({}, noWallet.context),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});

// --- checkout.ts: metadata, cache miss, show/cancel branches ---
describe('checkout.ts coverage', () => {
  it('checkout create with metadata and description', async () => {
    await withTempHome(async () => {
      const runtime = createMockRuntime({
        yes: true,
        config: {
          payApiKey: 'pay-key',
          payBaseUrl: 'https://pay.example',
        },
        requestJson: async (url) => {
          if (url.endsWith('/api/merchants/me')) {
            return { success: true, responseObject: { id: 'm1', defaultAddress: DEFAULT_ADDRESS } };
          }
          if (url.endsWith('/api/checkout/sessions')) {
            return { success: true, responseObject: { session: { id: 's1', status: 'CREATED' }, sessionToken: 't1', checkoutUrl: 'https://pay.example/checkout', url } };
          }
          return { url };
        },
      });

      const result = await run(['checkout', 'create'], {
        amount: 10,
        description: 'Test order',
        metadata: '{"key":"value","nested":{"deep":true}}',
      }, runtime);
      expect(result).toMatchObject({ ok: true });
    });
  });

  it('checkout show returns from API', async () => {
    const runtime = createMockRuntime({
      config: {
        payApiKey: 'pay-key',
        payBaseUrl: 'https://pay.example',
      },
      requestJson: async () => ({ orderId: 'order-1', status: 'CREATED' }),
    });
    const result = await run(['checkout', 'show'], { sessionId: 'order-1' }, runtime);
    expect(result).toMatchObject({ ok: true, data: { orderId: 'order-1' } });
  });

  it('checkout cancel executes with --yes', async () => {
    const runtime = createMockRuntime({
      yes: true,
      config: {
        payApiKey: 'pay-key',
        payBaseUrl: 'https://pay.example',
      },
      requestJson: async () => ({ orderId: 'order-1', status: 'cancelled' }),
    });
    const result = await run(['checkout', 'cancel'], { sessionId: 'order-1' }, runtime);
    expect(result).toMatchObject({ ok: true });
  });
});

// --- deposit.ts: ensure-allowance hadAllowance path, deposit list without owner ---
describe('deposit.ts coverage', () => {
  it('deposit list without owner returns all deposits', async () => {
    const runtime = makeContext({ walletAddress: undefined as unknown as `0x${string}` });
    const result = await lookup(['deposit', 'list']).handler({}, runtime.context);
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'all' })]));
  });

  it('deposit ensure-allowance returns early when already approved', async () => {
    // The mock's readContract returns 123n for allowance, which is >= parseUnits('0.0001', 6) = 100n
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    const result = await lookup(['deposit', 'ensure-allowance']).handler({ amount: 0.0001 }, runtime.context);
    expect(result).toMatchObject({ hadAllowance: true });
  });
});

// --- config unset/reset ---
describe('config unset and reset', () => {
  it('config unset removes a stored value', async () => {
    await withTempHome(async () => {
      await run(['config', 'set'], { key: 'env', value: 'staging' });
      await run(['config', 'set'], { key: 'rpcUrl', value: 'https://custom-rpc' });
      const unset = await run(['config', 'unset'], { key: 'rpcUrl' });
      expect(unset).toMatchObject({ ok: true });
      const show = await run(['config', 'show'], {});
      expect(show).toMatchObject({ ok: true, data: { stored: expect.objectContaining({ env: 'staging' }) } });
      expect((show as { data: { stored: Record<string, unknown> } }).data.stored).not.toHaveProperty('rpcUrl');
    });
  });

  it('config reset clears all stored values', async () => {
    await withTempHome(async () => {
      await run(['config', 'set'], { key: 'env', value: 'staging' });
      const reset = await run(['config', 'reset'], {});
      expect(reset).toMatchObject({ ok: true, data: {} });
      const show = await run(['config', 'show'], {});
      expect((show as { data: { stored: Record<string, unknown> } }).data.stored).toEqual({});
    });
  });
});

// --- deposit set-range min <= max validation ---
describe('deposit set-range validation', () => {
  it('rejects min > max', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(
      lookup(['deposit', 'set-range']).handler({ id: '1', min: 100, max: 50 }, runtime.context),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('must be less than or equal to'),
    });
  });
});

// --- delegate.ts: line 49 (undelegate without explicit escrow) ---
describe('delegate.ts coverage', () => {
  it('undelegate without explicit escrow', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    const result = await lookup(['undelegate']).handler({ deposit: '7' }, runtime.context);
    expect(result).toMatchObject({ executed: true });
  });
});

// --- helpers.ts ---
describe('helpers.ts coverage', () => {
  it('deposit create uses sdkSeparatePrepareHandler (line 159)', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    const result = await lookup(['deposit', 'create']).handler({
      amount: 100, min: 10, max: 100,
      platforms: 'wise', currencies: 'USD', rate: 1.01,
      depositData: '[{"email":"test@test.com"}]',
    }, runtime.context);
    expect(result).toMatchObject({ executed: true });
  });

  it('sdkSeparatePrepareHandler propagates prepare errors (lines 166-168)', async () => {
    const runtime = createMockRuntime({
      yes: true,
      behaviors: {
        prepareCreateDeposit: () => { throw new Error('prepare boom'); },
        createDeposit: () => ({ ok: true }),
      },
    });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20,
      platforms: 'wise', currencies: 'USD', rate: 1.2,
      depositData: '[{"email":"test@test.com"}]',
    }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ message: 'prepare boom' }) });
  });

  it('sdkSeparatePrepareHandler propagates execute errors (lines 178-180)', async () => {
    const runtime = createMockRuntime({
      yes: true,
      behaviors: { createDeposit: () => { throw new Error('execute boom'); } },
    });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20,
      platforms: 'wise', currencies: 'USD', rate: 1.2,
      depositData: '[{"email":"test@test.com"}]',
    }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ message: 'execute boom' }) });
  });

  it('resolveMethod throws for non-traversable path (lines 16-17)', async () => {
    const { sdkReadHandler } = await import('../src/commands/helpers.js');
    const ctx = {
      getClient: async () => ({ client: { leaf: 'not-an-object' }, publicClient: {}, walletClient: {} }),
      config: { env: 'production' }, command: 'peer test',
    };
    const handler = sdkReadHandler(['leaf', 'nested', 'method'], async () => [], { requireWallet: false });
    await expect(handler({}, ctx as never)).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });
  });

  it('sdkWriteHandler propagates prepare errors (lines 90-92)', async () => {
    const runtime = createMockRuntime({
      yes: true,
      behaviors: {
        addFunds: (() => {
          const fn = async () => ({ ok: true });
          fn.prepare = async () => { throw new Error('prepare failed'); };
          return fn;
        })(),
      },
    });
    const result = await run(['deposit', 'add-funds'], { id: '7', amount: 2 }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ message: 'prepare failed' }) });
  });

  it('sdkWriteHandler propagates execute errors (lines 102-104)', async () => {
    const runtime = createMockRuntime({
      yes: true,
      behaviors: {
        addFunds: (() => {
          const fn = async () => { throw new Error('write boom'); };
          fn.prepare = async () => ({ prepared: { to: DEFAULT_ADDRESS, data: '0x', value: 0n, chainId: 8453 } });
          return fn;
        })(),
      },
    });
    const result = await run(['deposit', 'add-funds'], { id: '7', amount: 2 }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ message: 'write boom' }) });
  });

  it('sdkDirectWriteHandler propagates errors (lines 127-129)', async () => {
    const runtime = createMockRuntime({
      yes: true,
      behaviors: { registerPayeeDetails: () => { throw new Error('direct write boom'); } },
    });
    const result = await run(['payee', 'register'], { processors: 'wise', depositData: '[{"email":"test@test.com"}]' }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ message: 'direct write boom' }) });
  });
});

// --- deposit.ts enrichment ---
describe('deposit.ts enrichment coverage', () => {
  it('resolveHashName returns undefined for non-string code (lines 32-33)', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getDeposit: () => ({ depositId: '1', paymentMethods: [{ paymentMethod: 'hash', currencies: [{ code: 12345, minConversionRate: '1000000000000000000' }] }] }),
      },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    const data = result as { paymentMethods: Array<{ currencies: Array<{ currencyName?: string }> }> };
    expect(data.paymentMethods[0]?.currencies[0]?.currencyName).toBeUndefined();
  });

  it('formatMinConversionRate handles bigint (lines 39-40)', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getDeposit: () => ({ depositId: '1', paymentMethods: [{ paymentMethod: 'hash', currencies: [{ code: 'hash', minConversionRate: 1200000000000000000n }] }] }),
      },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    const data = result as { paymentMethods: Array<{ currencies: Array<{ minConversionRateDecimal?: string }> }> };
    expect(data.paymentMethods[0]?.currencies[0]?.minConversionRateDecimal).toBe('1.2');
  });

  it('formatMinConversionRate handles integer number (lines 42-43)', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getDeposit: () => ({ depositId: '1', paymentMethods: [{ paymentMethod: 'hash', currencies: [{ code: 'hash', minConversionRate: 1000000000000000000 }] }] }),
      },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    const data = result as { paymentMethods: Array<{ currencies: Array<{ minConversionRateDecimal?: string }> }> };
    expect(data.paymentMethods[0]?.currencies[0]?.minConversionRateDecimal).toBe('1');
  });

  it('enrichDepositCurrency returns non-record as-is (lines 52-53)', async () => {
    const runtime = createMockRuntime({
      behaviors: { getDeposit: () => ({ depositId: '1', paymentMethods: [{ paymentMethod: 'hash', currencies: ['string', null, 42] }] }) },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    expect((result as { paymentMethods: Array<{ currencies: unknown[] }> }).paymentMethods[0]?.currencies).toEqual(['string', null, 42]);
  });

  it('enrichDepositPaymentMethod returns non-record as-is (lines 66-67)', async () => {
    const runtime = createMockRuntime({
      behaviors: { getDeposit: () => ({ depositId: '1', paymentMethods: ['string-pm', null] }) },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    expect((result as { paymentMethods: unknown[] }).paymentMethods).toEqual(['string-pm', null]);
  });

  it('handles PM without currencies array (line 75)', async () => {
    const runtime = createMockRuntime({
      behaviors: { getDeposit: () => ({ depositId: '1', paymentMethods: [{ paymentMethod: 'hash' }] }) },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    expect((result as { paymentMethods: Array<{ currencies?: unknown[] }> }).paymentMethods[0]?.currencies).toBeUndefined();
  });

  it('resolveHashName returns undefined for non-string paymentMethod', async () => {
    const runtime = createMockRuntime({
      behaviors: { getDeposit: () => ({ depositId: '1', paymentMethods: [{ paymentMethod: 99999, currencies: [] }] }) },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    expect((result as { paymentMethods: Array<{ paymentMethodName?: string }> }).paymentMethods[0]?.paymentMethodName).toBeUndefined();
  });

  it('formatMinConversionRate returns undefined for non-matching value (lines 47-48)', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getDeposit: () => ({
          depositId: '1',
          paymentMethods: [
            { paymentMethod: 'hash', currencies: [{ code: 'hash', minConversionRate: { notANumber: true } }] },
          ],
        }),
      },
    });
    const result = await definition(['deposit', 'show']).handler({ depositId: '1' }, runtime.context);
    const data = result as { paymentMethods: Array<{ currencies: Array<{ minConversionRateDecimal?: string }> }> };
    expect(data.paymentMethods[0]?.currencies[0]?.minConversionRateDecimal).toBeUndefined();
  });
});

// --- deposit.ts other paths ---
describe('deposit.ts remaining paths', () => {
  it('withUsdcAddress throws CONFIG_ERROR (line 190)', async () => {
    const runtime = createMockRuntime({ yes: true, behaviors: { getUsdcAddress: () => undefined } });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20, platforms: 'wise', currencies: 'USD', rate: 1.2,
      depositData: '[{"email":"test@test.com"}]',
    }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ code: 'CONFIG_ERROR' }) });
  });

  it('ensure-allowance no account (lines 207-208)', async () => {
    const runtime = createMockRuntime({ yes: true });
    runtime.bundle.walletClient = { ...runtime.bundle.walletClient, account: undefined } as unknown as typeof runtime.bundle.walletClient;
    await expect(definition(['deposit', 'ensure-allowance']).handler({ amount: 10 }, runtime.context)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('parseConversionRates with conversionRates JSON (lines 116-121)', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20,
      conversionRates: '[[{"currency":"USD","conversionRate":"1200000000000000000"}]]',
      depositData: '[{"email":"test@test.com"}]', platforms: 'wise',
    }, runtime);
    expect(result).toMatchObject({ ok: true });
  });

  it('missing conversion config (lines 126-127)', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await run(['deposit', 'create'], { amount: 100, min: 10, max: 20 }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) });
  });

  it('missing depositData with platforms (lines 134-148)', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20, platforms: 'wise', currencies: 'USD', rate: 1.2,
    }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) });
  });

  it('depositData length mismatch (lines 152-163)', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20, platforms: 'wise,venmo', currencies: 'USD', rate: 1.2,
      depositData: '[{"email":"one@test.com"}]',
    }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) });
  });

  it('depositData non-object entry (lines 168-175)', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20, platforms: 'wise', currencies: 'USD', rate: 1.2,
      depositData: '["not-an-object"]',
    }, runtime);
    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) });
  });

  it('indexer deposits list-relations (lines 708-710)', async () => {
    const runtime = makeContext({ walletAddress: DEFAULT_ADDRESS });
    const result = await lookup(['indexer', 'deposits', 'list-relations']).handler(
      { filter: '{"owner":"0x1"}', pagination: '{"limit":10}', options: '{"includeRates":true}' },
      runtime.context,
    );
    expect(result).toMatchObject({ path: 'getDepositsWithRelations' });
  });

  it('deposit create without platforms (empty depositData)', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await run(['deposit', 'create'], {
      amount: 100, min: 10, max: 20,
      conversionRates: '[[{"currency":"USD","conversionRate":"1200000000000000000"}]]',
    }, runtime);
    expect(result).toMatchObject({ ok: true });
  });
});

// --- vault.ts ---
describe('vault.ts coverage', () => {
  it('vault set-rates (lines 148-151)', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['vault', 'set-rates']).handler({
      id: 'vault-1', paymentMethods: '["0x1"]', currencies: '[["0x2"]]', rates: '[["1000000000000000000"]]',
    }, runtime.context)).resolves.toMatchObject({ executed: true });
  });

  it('vault set-config with hook (lines 179-184)', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['vault', 'set-config']).handler({
      id: 'vault-1', manager: DEFAULT_ADDRESS, feeRecipient: DEFAULT_ADDRESS,
      hook: DEFAULT_ADDRESS, name: 'Updated Vault', uri: 'ipfs://new',
    }, runtime.context)).resolves.toMatchObject({ executed: true });
  });

  it('vault set-config without hook', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['vault', 'set-config']).handler({
      id: 'vault-1', manager: DEFAULT_ADDRESS, feeRecipient: DEFAULT_ADDRESS,
      name: 'Updated Vault', uri: 'ipfs://new',
    }, runtime.context)).resolves.toMatchObject({ executed: true });
  });
});

// --- checkout.ts ---
describe('checkout.ts extra coverage', () => {
  it('nested session cache key (lines 46-55)', async () => {
    const runtime = makeContext({
      payApiKey: 'pay-key', walletAddress: DEFAULT_ADDRESS, yes: true,
      requestJson: async <T>(url: string) => {
        if (url.includes('/api/merchants/me')) return { success: true, responseObject: { id: 'merchant-1', defaultAddress: DEFAULT_ADDRESS } } as T;
        return { success: true, responseObject: { session: { session: { id: 'deeply-nested-id' } } } } as T;
      },
    });
    await lookup(['checkout', 'create']).handler({ amount: 10 }, runtime.context);
    expect(runtime.written.length).toBeGreaterThan(0);
  });

  it('cache miss (lines 96-97)', async () => {
    const runtime = makeContext({
      payApiKey: 'pay-key', walletAddress: DEFAULT_ADDRESS, yes: true,
      requestJson: async <T>(url: string) => {
        if (url.includes('/api/merchants/me')) return { success: true, responseObject: { id: 'merchant-1', defaultAddress: DEFAULT_ADDRESS } } as T;
        return { success: true, responseObject: { noKey: true } } as T;
      },
    });
    await lookup(['checkout', 'create']).handler({ amount: 10 }, runtime.context);
    expect(runtime.written).toHaveLength(0);
  });

  it('show cache hit (line 205)', async () => {
    const cachedData = JSON.stringify({ sessions: { 'order-1': { orderId: 'order-1', status: 'created' } } });
    const runtime = makeContext();
    runtime.context.readTextFile = async () => cachedData;
    const result = await lookup(['checkout', 'show']).handler({ sessionId: 'order-1' }, runtime.context);
    expect(result).toEqual({ source: 'cache', session: { orderId: 'order-1', status: 'created' } });
  });

  it('cancel with payApiKey', async () => {
    const runtime = makeContext({
      payApiKey: 'pay-key', yes: true,
      requestJson: async <T>() => ({ orderId: 'order-1', status: 'cancelled' }) as T,
    });
    const result = await lookup(['checkout', 'cancel']).handler({ sessionId: 'order-1' }, runtime.context);
    expect(result).toMatchObject({ executed: true });
  });

  it('create with explicit merchantId and recipient (line 171)', async () => {
    const runtime = createMockRuntime({
      yes: true,
      config: { payApiKey: 'pay-key', payBaseUrl: 'https://pay.example' },
      requestJson: async () => ({ success: true, responseObject: { session: { id: 'session-direct' } } }),
      readTextFile: async () => JSON.stringify({ sessions: {} }),
    });
    const result = await definition(['checkout', 'create']).handler(
      { amount: 10, merchantId: 'merchant-override', recipient: DEFAULT_ADDRESS },
      runtime.context,
    );
    expect(result).toMatchObject({ executed: true });
  });
});

// --- package.ts extra ---
describe('package.ts extra coverage', () => {
  it('root directory walk break (lines 20-21)', () => {
    const origCwd = process.cwd;
    const origArgv = process.argv[1]!;
    process.cwd = () => '/';
    process.argv[1] = '/index.js';
    try {
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const version = readPackageVersion();
      expect(typeof version).toBe('string');
      spy.mockRestore();
    } finally {
      process.cwd = origCwd;
      process.argv[1] = origArgv;
    }
  });

  it('catch branch (lines 53-56)', async () => {
    const { mkdir: mkdirAsync } = await import('node:fs/promises');
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-pkg-'));
    await mkdirAsync(join(dir, 'package.json'), { recursive: true });
    const origCwd = process.cwd;
    const origArgv = process.argv[1]!;
    process.cwd = () => dir;
    process.argv[1] = join(dir, 'index.js');
    try {
      const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const version = readPackageVersion();
      expect(version).toBe('0.1.0');
      expect(spy.mock.calls.some((call) => String(call[0]).includes('failed to read'))).toBe(true);
      spy.mockRestore();
    } finally {
      process.cwd = origCwd;
      process.argv[1] = origArgv;
    }
  });
});

// --- deposit mutation handlers via makeContext ---
describe('deposit mutation coverage via makeContext', () => {
  it('oracle set', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'oracle', 'set']).handler({ id: '7', paymentMethodHash: '0x1', currencyHash: '0x2', config: '{"feed":"chainlink"}' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('oracle remove', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'oracle', 'remove']).handler({ id: '7', paymentMethodHash: '0x1', currencyHash: '0x2' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('oracle set-batch', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'oracle', 'set-batch']).handler({ id: '7', paymentMethods: '["0x1"]', currencies: '[["0x2"]]', configs: '[[{"feed":"cl"}]]' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('currency-config update-batch', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'currency-config', 'update-batch']).handler({ id: '7', paymentMethods: '["0x1"]', updates: '[[{"c":"0x2"}]]' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('currency deactivate-batch', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'currency', 'deactivate-batch']).handler({ id: '7', paymentMethods: '["0x1"]', currencyCodes: '[["0x2"]]' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('prune-intents', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'prune-intents']).handler({ id: '7' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('remove-funds', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'remove-funds']).handler({ id: '7', amount: 5 }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('withdraw', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'withdraw']).handler({ id: '7' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('pause', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'pause']).handler({ id: '7' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('resume', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'resume']).handler({ id: '7' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('set-range', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'set-range']).handler({ id: '7', min: 10, max: 100 }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('set-rate', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'set-rate']).handler({ id: '7', paymentMethod: 'wise', currency: 'USD', rate: 1.25 }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('set-retain-on-empty', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'set-retain-on-empty']).handler({ id: '7', retain: true }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('set-delegate', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'set-delegate']).handler({ id: '7', delegate: DEFAULT_ADDRESS }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('remove-delegate', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'remove-delegate']).handler({ id: '7' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('payment-method add', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'payment-method', 'add']).handler({ id: '7', paymentMethods: 'wise', paymentMethodData: '[{"email":"t@t.com"}]', currencies: '[["USD"]]' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('payment-method set-active', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'payment-method', 'set-active']).handler({ id: '7', paymentMethod: 'wise', active: true }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('payment-method remove', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'payment-method', 'remove']).handler({ id: '7', paymentMethod: 'wise' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('currency add', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'currency', 'add']).handler({ id: '7', paymentMethod: 'wise', currencies: 'USD' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('currency deactivate', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'currency', 'deactivate']).handler({ id: '7', paymentMethod: 'wise', currency: 'USD' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
  it('currency remove', async () => {
    const rt = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    await expect(lookup(['deposit', 'currency', 'remove']).handler({ id: '7', paymentMethod: 'wise', currency: 'USD' }, rt.context)).resolves.toMatchObject({ executed: true });
  });
});

// --- cli.ts: inferEnv with --env, inferCommand with global options before command ---
describe('cli.ts coverage', () => {
  it('wraps unknown command with --env in error (inferEnv line 68, inferCommand lines 82-86)', async () => {
    // This test triggers renderTopLevelError with --env present and a global option before the unknown command
    // inferEnv: --env staging -> returns 'staging' (line 68)
    // inferCommand: --format json is a global option with value -> skip it (lines 82-84)
    const result = await runCliInProcess([
      'node', 'peer', '--env', 'staging', '--format', 'json', 'nonexistent',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"ok": false');
    expect(result.stderr).toContain("unknown command 'nonexistent'");
  });

  it('wraps unknown command with options after command parts (inferCommand line 89)', async () => {
    // inferCommand: 'nonexistent' is pushed as command part, then '--flag' triggers break (line 89)
    const result = await runCliInProcess([
      'node', 'peer', 'nonexistent', '--some-flag',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"ok": false');
  });

  it('wraps non-CommanderError in renderTopLevelError (line 106)', async () => {
    // Force a non-CommanderError by providing deps whose resolveConfig throws a plain Error
    // The framework won't catch it because it fails during the commander action setup
    const runtime = createMockRuntime();
    // Override createClient to throw a raw Error during the action handler
    const errorDeps = {
      ...runtime.deps,
      resolveConfig: async () => { throw new Error('resolveConfig exploded'); },
    };
    const result = await runCliInProcess(
      ['node', 'peer', 'quote', '--from', 'USD', '--amount', '10'],
      errorDeps,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"ok": false');
    expect(result.stderr).toContain('resolveConfig exploded');
  });
});
