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
    // The mcp handler calls startPeerMcpServer which tries to start stdio transport.
    // We just need to verify the handler is callable and exercises the function body.
    const handler = lookup(['mcp']).handler;
    // Mock the server module to avoid actual stdio
    const serverModule = await import('../src/mcp/server.js');
    vi.spyOn(serverModule, 'startPeerMcpServer').mockResolvedValue(undefined as never);
    const result = await handler({ full: true, readOnly: false }, runtime.context);
    expect(result).toBeUndefined();
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

// --- delegate.ts: line 49 (undelegate without explicit escrow) ---
// Already covered in vault-intent-delegate test

// --- helpers.ts: sdkSeparatePrepareHandler (lines 159, 166-168, 178-180) ---
describe('helpers.ts separate prepare coverage', () => {
  it('deposit create uses separate prepare handler', async () => {
    const runtime = makeContext({ yes: true, walletAddress: DEFAULT_ADDRESS });
    // deposit create uses sdkSeparatePrepareHandler
    const result = await lookup(['deposit', 'create']).handler({
      amount: 100,
      min: 10,
      max: 100,
      platforms: 'wise',
      currencies: 'USD',
      rate: 1.01,
      depositData: '[{"email":"test@test.com"}]',
    }, runtime.context);
    expect(result).toMatchObject({ executed: true });
  });
});
