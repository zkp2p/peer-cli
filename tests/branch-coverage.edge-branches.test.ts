import { describe, expect, it } from 'vitest';
import type { ClientBundle } from '../src/sdk/client.js';
import {
  ALT_TOKEN,
  DEFAULT_ADDRESS,
  getRateManagerContracts,
  lookup,
  makeContext,
  type QuoteResult,
} from './helpers/branch-coverage.js';

describe('branch coverage quote, market, intent, and delegate edge branches', () => {
  it('covers quote, market, intent, and delegate edge branches', async () => {
    const quoteRuntime = makeContext({
      walletAddress: DEFAULT_ADDRESS,
      getUsdcAddress: () => ALT_TOKEN,
    });
    const quoteUsdc = await lookup(['quote']).handler({ from: 'USD', amount: 5, to: 'USDC' }, quoteRuntime.context);
    expect((quoteUsdc as QuoteResult)[0]?.args[0]?.destinationToken).toBe(ALT_TOKEN);

    await expect(lookup(['market', 'compare']).handler({ from: 'USD', amount: 10 }, makeContext({ walletAddress: undefined }).context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    await expect(lookup(['market', 'volume']).handler({ period: '7d', granularity: 'daily' }, quoteRuntime.context)).resolves.toEqual({
      url: 'https://market.example/v1/volume?period=7d&granularity=daily',
    });

    const runtime = makeContext({ yes: true });
    await expect(lookup(['intent', 'cleanup-orphaned']).handler({ hashes: ['0x1', '0x2'] }, runtime.context)).resolves.toMatchObject({ executed: true });
    await expect(
      lookup(['intent', 'fulfill']).handler(
        { hash: '0xhash', proof: { proof: true }, precomputedAttestation: { attested: true } },
        runtime.context,
      ),
    ).resolves.toMatchObject({ executed: true });

    const delegateRuntime = makeContext({ yes: true });
    delegateRuntime.context.config.env = 'staging';
    delegateRuntime.bundle.client.getDeployedAddresses = (() => ({ escrow: DEFAULT_ADDRESS })) as unknown as ClientBundle['client']['getDeployedAddresses'];
    await expect(lookup(['delegate', 'set']).handler({ deposit: '7', vault: 'vault-1' }, delegateRuntime.context)).resolves.toMatchObject({
      executed: true,
    });
    expect(getRateManagerContracts).toHaveBeenCalledWith(8453, 'staging');
  });
});
