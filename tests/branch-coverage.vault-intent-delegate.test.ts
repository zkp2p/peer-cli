import { describe, expect, it } from 'vitest';
import {
  ALT_TOKEN,
  DEFAULT_ADDRESS,
  lookup,
  makeContext,
  resolveFiatCurrencyBytes32,
  resolvePaymentMethodHash,
} from './helpers/branch-coverage.js';

describe('branch coverage vault, intent, and delegate branches', () => {
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

    // vault list returns raw SDK data
    const vaultList = await lookup(['vault', 'list']).handler({}, runtime.context);
    expect(vaultList).toEqual([
      expect.objectContaining({
        manager: expect.objectContaining({ name: 'Test Vault', rateManagerId: '0xabc123' }),
        aggregate: expect.objectContaining({ currentDelegatedDeposits: 2, fulfilledIntents: 5 }),
      }),
    ]);

    // vault list with manager filter
    const filteredList = await lookup(['vault', 'list']).handler({ manager: DEFAULT_ADDRESS }, runtime.context);
    expect(filteredList).toEqual(expect.arrayContaining([
      expect.objectContaining({ manager: expect.objectContaining({ name: 'Test Vault' }) }),
    ]));

    // vault show falls back to list when detail returns null
    const vaultShow = await lookup(['vault', 'show']).handler({ rateManagerId: '0xabc123' }, runtime.context);
    expect(vaultShow).toMatchObject({
      manager: expect.objectContaining({ name: 'Test Vault', rateManagerId: '0xabc123' }),
      aggregate: expect.objectContaining({ fulfilledIntents: 5 }),
    });

    // vault show with unknown ID throws
    await expect(lookup(['vault', 'show']).handler({ rateManagerId: '0xdeadbeef' }, runtime.context)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    // vault list with raw pagination/filter JSON
    const rawList = await lookup(['vault', 'list']).handler({ pagination: '{"limit":5}', filter: '{"hasHook":true}' }, runtime.context);
    expect(rawList).toEqual(expect.arrayContaining([
      expect.objectContaining({ manager: expect.objectContaining({ name: 'Test Vault' }) }),
    ]));

    // vault delegates with typed flags
    await expect(lookup(['vault', 'delegates']).handler({ rateManagerId: '0xabc123', limit: 10 }, runtime.context)).resolves.toMatchObject({
      path: 'getRateManagerDelegations',
    });
    // vault delegates with raw pagination JSON
    await expect(lookup(['vault', 'delegates']).handler({ rateManagerId: '0xabc123', pagination: '{"limit":5}' }, runtime.context)).resolves.toMatchObject({
      path: 'getRateManagerDelegations',
    });

    // vault snapshots with typed limit
    await expect(lookup(['vault', 'snapshots']).handler({ rateManagerId: '0xabc123', limit: 7 }, runtime.context)).resolves.toMatchObject({
      path: 'getManagerDailySnapshots',
    });
    // vault snapshots with raw options JSON
    await expect(lookup(['vault', 'snapshots']).handler({ rateManagerId: '0xabc123', options: '{"limit":3}' }, runtime.context)).resolves.toMatchObject({
      path: 'getManagerDailySnapshots',
    });

    // vault manual-rate-updates with typed limit
    await expect(lookup(['vault', 'manual-rate-updates']).handler({ rateManagerId: '0xabc123', limit: 10 }, runtime.context)).resolves.toMatchObject({
      path: 'getManualRateUpdates',
    });
    // vault manual-rate-updates with raw options
    await expect(lookup(['vault', 'manual-rate-updates']).handler({ rateManagerId: '0xabc123', options: '{"limit":3}' }, runtime.context)).resolves.toMatchObject({
      path: 'getManualRateUpdates',
    });

    // vault oracle-config-updates with typed limit
    await expect(lookup(['vault', 'oracle-config-updates']).handler({ rateManagerId: '0xabc123', limit: 10 }, runtime.context)).resolves.toMatchObject({
      path: 'getOracleConfigUpdates',
    });
    // vault oracle-config-updates with raw options
    await expect(lookup(['vault', 'oracle-config-updates']).handler({ rateManagerId: '0xabc123', options: '{"limit":3}' }, runtime.context)).resolves.toMatchObject({
      path: 'getOracleConfigUpdates',
    });

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
});
