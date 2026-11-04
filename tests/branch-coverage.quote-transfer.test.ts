import { describe, expect, it } from 'vitest';
import { ALT_TOKEN, DEFAULT_ADDRESS, lookup, makeContext, type QuoteResult } from './helpers/branch-coverage.js';

describe('branch coverage quote and transfer branches', () => {
  it('covers quote and transfer alternate paths', async () => {
    const runtime = makeContext({ walletAddress: DEFAULT_ADDRESS });

    const quote = await lookup(['quote']).handler({ from: 'USD', tokenAmount: 5 }, runtime.context);
    expect((quote as QuoteResult)[0]?.args[0]?.isExactFiat).toBe(false);
    expect((quote as QuoteResult)[0]?.args[0]?.amount).toBe('5000000');

    const quoteExact = await lookup(['quote']).handler(
      {
        from: 'USD',
        amount: 5,
        platform: 'wise',
        recipient: DEFAULT_ADDRESS,
        user: DEFAULT_ADDRESS,
        to: ALT_TOKEN,
      },
      runtime.context,
    );
    expect((quoteExact as QuoteResult)[0]?.args[0]?.isExactFiat).toBe(true);
    expect((quoteExact as QuoteResult)[0]?.args[0]?.amount).toBe('5000000');

    await expect(lookup(['quote']).handler({ from: 'USD' }, runtime.context)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1, token: ALT_TOKEN }, runtime.context)).resolves.toMatchObject({
      executed: false,
      preview: {
        description: `Transfer 1 ${ALT_TOKEN} to ${DEFAULT_ADDRESS}.`,
      },
    });

    const noUsdc = makeContext({ getUsdcAddress: () => undefined });
    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1 }, noUsdc.context)).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
    });

    const noWalletTransfer = makeContext({ walletAddress: undefined });
    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1 }, noWalletTransfer.context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
});
