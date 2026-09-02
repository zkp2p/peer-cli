import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../src/commands/registry.js';
import { buildInputSchema, executeDefinition } from '../src/commands/framework.js';
import { createMockRuntime } from './helpers/mock-runtime.js';

const OWNER = '0x1111111111111111111111111111111111111111';
const TAKER = '0x2222222222222222222222222222222222222222';
const POLICY = '0x3333333333333333333333333333333333333333';
const PAYMENT_METHOD = `0x${'44'.repeat(32)}`;

function definition(path: string[]) {
  const result = commandDefinitions.find((entry) => entry.path.join(' ') === path.join(' '));
  if (!result) throw new Error(`Missing command: ${path.join(' ')}`);
  return result;
}

describe('staking and guardian commands', () => {
  it('registers the complete preview-first operator families', () => {
    const names = new Set(commandDefinitions.map((entry) => entry.path.join(' ')));
    expect(names.has('stake state')).toBe(true);
    expect(names.has('stake indexed-state')).toBe(true);
    expect(names.has('stake ensure-allowance')).toBe(true);
    expect(names.has('stake deposit')).toBe(true);
    expect(names.has('stake withdraw')).toBe(true);
    expect(names.has('stake release-matured-batch')).toBe(true);
    expect(names.has('guardian quote-extension')).toBe(true);
    expect(names.has('guardian extend-intent')).toBe(true);
  });

  it('publishes mandatory operator inputs as required MCP fields', () => {
    expect(buildInputSchema(definition(['stake', 'state']))).toMatchObject({
      required: ['staker'],
    });
    expect(buildInputSchema(definition(['stake', 'authorization']))).toMatchObject({
      required: ['owner', 'taker'],
    });
    expect(buildInputSchema(definition(['stake', 'deposit']))).toMatchObject({
      required: ['amount'],
    });
    expect(buildInputSchema(definition(['stake', 'dispute-protection-enabled']))).toMatchObject({
      required: ['escrow', 'depositId', 'paymentMethod'],
    });
    expect(buildInputSchema(definition(['guardian', 'quote-extension']))).toMatchObject({
      required: ['intentAmount', 'additionalSeconds'],
    });
    expect(buildInputSchema(definition(['guardian', 'extend-intent']))).toMatchObject({
      required: ['escrow', 'depositId', 'intentHash', 'additionalSeconds', 'maxCost'],
    });
  });

  it('reads authoritative and indexed staking state with resolved contract coordinates', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getStakeOwner: () => OWNER,
        getStakeVaultContract: () => ({ address: TAKER, stakeToken: OWNER, abi: [] }),
        getDisputeProtectionPolicyContract: () => ({ address: POLICY, abi: [] }),
        'indexer.getStakingState': (params: unknown) => ({ params, freshness: { indexedBlockNumber: '99' } }),
      },
    });

    const result = await executeDefinition(
      definition(['stake', 'indexed-state']),
      { taker: TAKER },
      { env: 'production' },
      runtime.deps,
    );

    expect(result).toMatchObject({ ok: true, data: { freshness: { indexedBlockNumber: '99' } } });
    expect(runtime.calls.find((entry) => entry.path === 'indexer.getStakingState')?.args[0]).toEqual({
      chainId: 8453,
      environment: 'base',
      vaultAddress: TAKER,
      disputeProtectionPolicyAddress: POLICY,
      taker: TAKER,
      stakeOwner: OWNER,
    });
  });

  it('reads method-scoped dispute protection through the stable SDK API', async () => {
    const runtime = createMockRuntime();
    const result = await executeDefinition(
      definition(['stake', 'dispute-protection-enabled']),
      { escrow: OWNER, depositId: '7', paymentMethod: PAYMENT_METHOD },
      {},
      runtime.deps,
    );

    expect(result).toMatchObject({ ok: true });
    expect(runtime.calls.find((entry) => entry.path === 'isDisputeProtectionEnabled')?.args).toEqual([
      OWNER,
      7n,
      PAYMENT_METHOD,
    ]);
  });

  it('previews stake and guardian writes until --yes is explicit', async () => {
    const stakeRuntime = createMockRuntime();
    const stake = await executeDefinition(
      definition(['stake', 'deposit']),
      { amount: 25 },
      {},
      stakeRuntime.deps,
    );
    expect(stake).toMatchObject({ ok: true, data: { executed: false } });
    expect(stakeRuntime.calls.some((entry) => entry.path === 'depositStake')).toBe(false);

    const guardianRuntime = createMockRuntime();
    const guardian = await executeDefinition(
      definition(['guardian', 'extend-intent']),
      {
        escrow: OWNER,
        depositId: '7',
        intentHash: `0x${'ab'.repeat(32)}`,
        additionalSeconds: '3600',
        maxCost: '1500000',
      },
      {},
      guardianRuntime.deps,
    );
    expect(guardian).toMatchObject({ ok: true, data: { executed: false } });
    expect(guardianRuntime.calls.some((entry) => entry.path === 'extendIntentLifetime')).toBe(false);
  });

  it('passes guardian amounts through as deposit-token base units', async () => {
    const runtime = createMockRuntime({ yes: true });
    const intentHash = `0x${'ab'.repeat(32)}`;
    const result = await executeDefinition(
      definition(['guardian', 'extend-intent']),
      {
        escrow: OWNER,
        depositId: '7',
        intentHash,
        additionalSeconds: '3600',
        maxCost: '1500000',
      },
      { yes: true },
      runtime.deps,
    );

    expect(result).toMatchObject({ ok: true, data: { executed: true } });
    expect(runtime.calls.find((entry) => entry.path === 'extendIntentLifetime')?.args[0]).toEqual({
      escrow: OWNER,
      depositId: 7n,
      intentHash,
      additionalTime: 3600n,
      maxCost: 1500000n,
    });
  });

  it('uses the dispute protection SDK methods for matured intent releases', async () => {
    const runtime = createMockRuntime({ yes: true });
    const intentHash = `0x${'ab'.repeat(32)}`;
    const result = await executeDefinition(
      definition(['stake', 'release-matured']),
      { intentHash, policy: POLICY },
      { yes: true },
      runtime.deps,
    );

    expect(result).toMatchObject({ ok: true, data: { executed: true } });
    expect(
      runtime.calls.find((entry) => entry.path === 'releaseMaturedDisputeProtectionIntent')
        ?.args[0],
    ).toEqual({
      intentHash,
      disputeProtectionPolicyAddress: POLICY,
    });
  });
});
