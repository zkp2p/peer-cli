import { describe, expect, it, vi } from 'vitest';
import { runCliInProcess } from './helpers/cli-runner.js';
import { createMockRuntime } from './helpers/mock-runtime.js';

type MockPreparedMethod = ReturnType<typeof vi.fn> & {
  prepare: ReturnType<typeof vi.fn>;
};

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
});
