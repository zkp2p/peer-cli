import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../src/commands/registry.js';
import { executeDefinition } from '../src/commands/framework.js';
import { createMockRuntime } from './helpers/mock-runtime.js';

const intentHash = `0x${'ab'.repeat(32)}`;
const release = commandDefinitions.find((entry) => entry.path.join(' ') === 'intent release')!;

function releaseParams(runtime: ReturnType<typeof createMockRuntime>) {
  return runtime.calls.find((entry) => entry.path.startsWith('releaseFundsToPayer'))?.args[0];
}

// SDK 0.15 made releaseAmount required: OrchestratorV4 releases exactly that
// amount, and a depositor must release the whole intent.
describe('intent release', () => {
  it('releases the full on-chain intent amount by default', async () => {
    const runtime = createMockRuntime({
      yes: true,
      behaviors: { getIntent: () => ({ intent: { amount: 49_100_000n } }) },
    });
    const result = await executeDefinition(release, { hash: intentHash }, { yes: true }, runtime.deps);

    expect(result).toMatchObject({ ok: true });
    expect(runtime.calls.find((entry) => entry.path === 'getIntent')?.args[0]).toBe(intentHash);
    expect(releaseParams(runtime)).toEqual({ intentHash, releaseAmount: 49_100_000n });
  });

  it('releases an explicit USDC amount without reading the intent', async () => {
    const runtime = createMockRuntime({ yes: true });
    const result = await executeDefinition(release, { hash: intentHash, amount: 12.5 }, { yes: true }, runtime.deps);

    expect(result).toMatchObject({ ok: true });
    expect(runtime.calls.some((entry) => entry.path === 'getIntent')).toBe(false);
    expect(releaseParams(runtime)).toEqual({ intentHash, releaseAmount: 12_500_000n });
  });
});
