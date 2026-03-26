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
