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

    // delegate set-direct
    await expect(
      lookup(['delegate', 'set-direct']).handler({ deposit: '7', rateManagerAddress: DEFAULT_ADDRESS, vault: 'vault-1' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // delegate clear-direct
    await expect(
      lookup(['delegate', 'clear-direct']).handler({ deposit: '7' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // undelegate with explicit escrow
    await expect(
      lookup(['undelegate']).handler({ deposit: '7', escrow: DEFAULT_ADDRESS }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit oracle set
    await expect(
      lookup(['deposit', 'oracle', 'set']).handler({ id: '1', paymentMethodHash: '0xaa', currencyHash: '0xbb', config: '{"feed":"chainlink"}' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit oracle remove
    await expect(
      lookup(['deposit', 'oracle', 'remove']).handler({ id: '1', paymentMethodHash: '0xaa', currencyHash: '0xbb' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit oracle set-batch
    await expect(
      lookup(['deposit', 'oracle', 'set-batch']).handler({ id: '1', paymentMethods: '["0xaa"]', currencies: '[["0xbb"]]', configs: '[[{"feed":"cl"}]]' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit prune-intents
    await expect(
      lookup(['deposit', 'prune-intents']).handler({ id: '1' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit currency-config update-batch
    await expect(
      lookup(['deposit', 'currency-config', 'update-batch']).handler({ id: '1', paymentMethods: '["0xaa"]', updates: '[[{"currency":"0xbb","rate":"1"}]]' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit currency deactivate-batch
    await expect(
      lookup(['deposit', 'currency', 'deactivate-batch']).handler({ id: '1', paymentMethods: '["0xaa"]', currencyCodes: '[["0xbb"]]' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit remove-funds
    await expect(
      lookup(['deposit', 'remove-funds']).handler({ id: '1', amount: 10 }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit withdraw
    await expect(
      lookup(['deposit', 'withdraw']).handler({ id: '1' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit pause
    await expect(
      lookup(['deposit', 'pause']).handler({ id: '1' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit resume
    await expect(
      lookup(['deposit', 'resume']).handler({ id: '1' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit set-range
    await expect(
      lookup(['deposit', 'set-range']).handler({ id: '1', min: 10, max: 100 }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit set-rate
    await expect(
      lookup(['deposit', 'set-rate']).handler({ id: '1', paymentMethod: 'wise', currency: 'USD', rate: 1.01 }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit set-retain-on-empty
    await expect(
      lookup(['deposit', 'set-retain-on-empty']).handler({ id: '1', retain: true }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit set-delegate
    await expect(
      lookup(['deposit', 'set-delegate']).handler({ id: '1', delegate: DEFAULT_ADDRESS }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit remove-delegate
    await expect(
      lookup(['deposit', 'remove-delegate']).handler({ id: '1' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit payment-method add
    await expect(
      lookup(['deposit', 'payment-method', 'add']).handler({ id: '1', paymentMethods: 'wise', paymentMethodData: '[{"email":"test@test.com"}]', currencies: '[["USD"]]' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit payment-method set-active
    await expect(
      lookup(['deposit', 'payment-method', 'set-active']).handler({ id: '1', paymentMethod: 'wise', active: true }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit payment-method remove
    await expect(
      lookup(['deposit', 'payment-method', 'remove']).handler({ id: '1', paymentMethod: 'wise' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit currency add
    await expect(
      lookup(['deposit', 'currency', 'add']).handler({ id: '1', paymentMethod: 'wise', currencies: 'USD' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit currency deactivate
    await expect(
      lookup(['deposit', 'currency', 'deactivate']).handler({ id: '1', paymentMethod: 'wise', currency: 'USD' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });

    // deposit currency remove
    await expect(
      lookup(['deposit', 'currency', 'remove']).handler({ id: '1', paymentMethod: 'wise', currency: 'USD' }, runtime.context),
    ).resolves.toMatchObject({ executed: true });
  });
});
