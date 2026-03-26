import { describe, expect, it } from 'vitest';
import { ALT_TOKEN, DEFAULT_ADDRESS, lookup, makeContext, type QuoteResult } from './helpers/branch-coverage.js';

describe('branch coverage quote, market, transfer, and checkout branches', () => {
  it('covers quote, market, transfer, and checkout alternate paths', async () => {
    const runtime = makeContext({ walletAddress: DEFAULT_ADDRESS });

    const quote = await lookup(['quote']).handler({ from: 'USD', tokenAmount: 5 }, runtime.context);
    expect((quote as QuoteResult)[0]?.args[0]?.isExactFiat).toBe(false);

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

    await expect(lookup(['quote']).handler({ from: 'USD' }, runtime.context)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(lookup(['market', 'volume']).handler({ period: '24h', granularity: 'daily' }, runtime.context)).resolves.toEqual({
      url: 'https://market.example/v1/volume?period=1d&granularity=daily',
    });
    await expect(lookup(['market', 'volume']).handler({ period: 'bad', granularity: 'daily' }, runtime.context)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1, token: ALT_TOKEN }, runtime.context)).resolves.toMatchObject({
      executed: false,
      preview: expect.any(Object),
    });

    const noUsdc = makeContext({ getUsdcAddress: () => undefined });
    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1 }, noUsdc.context)).rejects.toMatchObject({
      code: 'CONFIG_ERROR',
    });

    const noWalletTransfer = makeContext({ walletAddress: undefined });
    await expect(lookup(['transfer']).handler({ to: DEFAULT_ADDRESS, amount: 1 }, noWalletTransfer.context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });

    const noWallet = makeContext({ payApiKey: 'pay-key', walletAddress: undefined });
    await expect(lookup(['checkout', 'create']).handler({ amount: 12 }, noWallet.context)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    const checkoutCreate = makeContext({
      payApiKey: 'pay-key',
      walletAddress: DEFAULT_ADDRESS,
      requestJson: async <T>() => ({ path: 'checkout.session', orderId: 'order-1' } as T),
      yes: true,
    });
    await expect(
      lookup(['checkout', 'create']).handler({ amount: 12, recipient: DEFAULT_ADDRESS, description: 'demo' }, checkoutCreate.context),
    ).resolves.toMatchObject({ executed: true, result: { path: 'checkout.session' } });

    const checkout = makeContext({
      cache: {
        '/root/.peer/checkout-sessions.json': JSON.stringify({
          sessions: { order1: { orderId: 'order1', status: 'fulfilled' } },
        }),
      },
    });
    checkout.context.readTextFile = async () => checkout.cache['/root/.peer/checkout-sessions.json'] ?? '';

    await expect(lookup(['checkout', 'list']).handler({ status: 'completed' }, checkout.context)).resolves.toEqual({
      source: 'cache',
      sessions: [{ orderId: 'order1', status: 'fulfilled' }],
    });
    await expect(lookup(['checkout', 'show']).handler({ sessionId: 'missing' }, checkout.context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
});
