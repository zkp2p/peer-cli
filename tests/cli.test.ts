import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCliInProcess } from './helpers/cli-runner.js';
import { createMockRuntime } from './helpers/mock-runtime.js';
import { isMainModule, inferCommand } from '../src/cli.js';

type MockPreparedMethod = ReturnType<typeof vi.fn> & {
  prepare: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isMainModule', () => {
  it('returns false when argv[1] does not match cli entry', () => {
    expect(isMainModule()).toBe(false);
  });
});

describe('inferCommand', () => {
  it('extracts command parts from argv', () => {
    expect(inferCommand(['node', 'peer', 'quote'])).toBe('peer quote');
    expect(inferCommand(['node', 'peer', 'deposit', 'create'])).toBe('peer deposit create');
    expect(inferCommand(['node', 'peer'])).toBe('peer');
  });

  it('skips global flags with values', () => {
    expect(inferCommand(['node', 'peer', '--env', 'staging', 'quote'])).toBe('peer quote');
    expect(inferCommand(['node', 'peer', '--format', 'table', 'market', 'spreads'])).toBe('peer market spreads');
  });

  it('skips boolean global flags', () => {
    expect(inferCommand(['node', 'peer', '--debug', 'quote'])).toBe('peer quote');
  });

  it('stops at command-level flags', () => {
    expect(inferCommand(['node', 'peer', 'quote', '--from', 'USD'])).toBe('peer quote');
  });

  it('handles empty tokens', () => {
    expect(inferCommand(['node', 'peer'])).toBe('peer');
  });
});

describe('in-process cli runner', () => {
  it('executes read commands and renders json output', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getQuote: vi.fn(async () => [{ route: 'fast', price: '1.23' }]),
      },
    });

    const result = await runCliInProcess(
      ['node', 'peer', 'quote', '--from', 'USD', '--amount', '10'],
      runtime.deps,
    );

    expect(result.exitCode).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('"ok": true');
    expect(result.stdout).toContain('"route": "fast"');
  });

  it('emits debug logs to stderr when --debug is enabled', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getQuote: vi.fn(async () => [{ route: 'fast', price: '1.23' }]),
      },
    });

    const result = await runCliInProcess(
      ['node', 'peer', '--debug', 'quote', '--from', 'USD', '--amount', '10'],
      runtime.deps,
    );

    expect(result.exitCode).toBeUndefined();
    expect(result.stdout).toContain('"ok": true');
    expect(result.stderr).toContain('[peer-cli] Resolved config');
    expect(result.stderr).toContain('[peer-cli] SDK read call');
    expect(result.stderr).toContain('"method":"getQuote"');
  });

  it('supports dry-run and execute flows for write commands', async () => {
    const addFunds = vi.fn(async () => ({ hash: '0xsent' })) as MockPreparedMethod;
    addFunds.prepare = vi.fn(async () => ({
      prepared: {
        to: '0x1111111111111111111111111111111111111111',
        data: '0xdeadbeef',
        value: 0n,
        chainId: 8453,
      },
      previewData: { amount: '2' },
    }));

    const runtime = createMockRuntime({
      behaviors: {
        addFunds,
      },
    });

    const dryRun = await runCliInProcess(
      ['node', 'peer', 'deposit', 'add-funds', '--id', '7', '--amount', '2'],
      runtime.deps,
    );
    expect(dryRun.stdout).toContain('"executed": false');
    expect(addFunds.prepare).toHaveBeenCalledTimes(1);
    expect(addFunds).not.toHaveBeenCalled();

    const executed = await runCliInProcess(
      ['node', 'peer', 'deposit', 'add-funds', '--id', '7', '--amount', '2', '--execute'],
      runtime.deps,
    );
    expect(executed.stdout).toContain('"executed": true');
    expect(executed.stdout).toContain('"hash": "0xsent"');
    expect(addFunds).toHaveBeenCalledTimes(1);
  });

  it('sets a non-zero exit code for command failures', async () => {
    const runtime = createMockRuntime();

    const failed = await runCliInProcess(
      ['node', 'peer', 'quote', '--from', 'USD'],
      runtime.deps,
    );

    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toContain('"code": "VALIDATION_ERROR"');
    expect(failed.stdout).toBe('');
  });

  it('sets a non-zero exit code for normalized API failures', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getQuote: async () => {
          throw {
            name: 'APIError',
            code: 'API',
            message: 'No quotes found',
            status: 404,
            details: {
              url: 'https://api.zkp2p.xyz/v2/quote/exact-fiat',
            },
          };
        },
      },
    });

    const failed = await runCliInProcess(
      ['node', 'peer', 'quote', '--from', 'USD', '--amount', '10'],
      runtime.deps,
    );

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('"ok": false');
    expect(failed.stderr).toContain('"code": "API_ERROR"');
    expect(failed.stderr).toContain('"message": "No quotes found"');
  });

  it('wraps invalid global env values in the json error envelope', async () => {
    const failed = await runCliInProcess(
      ['node', 'peer', '--env', 'fake', 'quote', '--from', 'USD', '--amount', '10'],
    );

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('"ok": false');
    expect(failed.stderr).toContain('"code": "VALIDATION_ERROR"');
    expect(failed.stderr).toContain('env must be one of: production, preproduction, staging.');
  });

  it('wraps unknown commands in the json error envelope', async () => {
    const runtime = createMockRuntime();

    const failed = await runCliInProcess(
      ['node', 'peer', 'nonexistent'],
      runtime.deps,
    );

    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toBe('');
    expect(failed.stderr).toContain('"ok": false');
    expect(failed.stderr).toContain('"code": "VALIDATION_ERROR"');
    expect(failed.stderr).toContain("unknown command 'nonexistent'");
    expect(failed.stderr).not.toContain('Usage: peer');
  });

  it('renders non-CommanderError exceptions in the json error envelope', async () => {
    // Trigger a non-CommanderError by passing deps that throw during program setup
    const brokenDeps = {
      createClient: async () => { throw new Error('boom'); },
      resolveConfig: async () => { throw new Error('config exploded'); },
      requestJson: async () => { throw new Error('nope'); },
    };
    const result = await runCliInProcess(
      ['node', 'peer', 'quote', '--from', 'USD', '--amount', '10'],
      brokenDeps,
    );
    // The error is caught by framework.ts executeDefinition, not renderTopLevelError
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"ok": false');
  });

  it('documents --execute as an alias for --yes in command help', async () => {
    const result = await runCliInProcess(
      ['node', 'peer', 'deposit', 'add-funds', '--help'],
    );

    expect(result.exitCode).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('--execute');
    expect(result.stdout).toContain('Alias for global --yes');
  });
});
