import { describe, expect, it } from 'vitest';
import { getCheckoutCachePath } from '../src/sdk/config.js';
import { DEFAULT_ADDRESS, lookup, makeContext } from './helpers/branch-coverage.js';

describe('branch coverage checkout cache and api-key branches', () => {
  it('covers checkout cache and api-key edge cases', async () => {
    const list = lookup(['checkout', 'list']);
    const create = lookup(['checkout', 'create']);
    const show = lookup(['checkout', 'show']);
    const cachePath = getCheckoutCachePath();

    const emptyCache = makeContext({ walletAddress: DEFAULT_ADDRESS });
    emptyCache.context.readTextFile = async () => {
      const error = new Error('missing') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    };
    await expect(list.handler({}, emptyCache.context)).resolves.toEqual({ source: 'cache', sessions: [] });

    const brokenCache = makeContext({ walletAddress: DEFAULT_ADDRESS });
    brokenCache.context.readTextFile = async () => {
      throw new Error('boom');
    };
    await expect(list.handler({}, brokenCache.context)).rejects.toMatchObject({ code: 'CONFIG_ERROR' });

    const cached = makeContext({
      cache: {
        [cachePath]: JSON.stringify({
          sessions: {
            order1: { orderId: 'order1', state: 'created' },
            order2: { orderId: 'order2', status: 'fulfilled' },
          },
        }),
      },
    });
    cached.context.readTextFile = async () => cached.cache[cachePath] ?? '';

    await expect(list.handler({ status: 'pending' }, cached.context)).resolves.toEqual({
      source: 'cache',
      sessions: [{ orderId: 'order1', state: 'created' }],
    });
    await expect(list.handler({ status: 'completed' }, cached.context)).resolves.toEqual({
      source: 'cache',
      sessions: [{ orderId: 'order2', status: 'fulfilled' }],
    });
    const blankStatus = await list.handler({ status: '' }, cached.context);
    expect(blankStatus).toEqual({
      source: 'cache',
      sessions: expect.arrayContaining([
        { orderId: 'order1', state: 'created' },
        { orderId: 'order2', status: 'fulfilled' },
      ]),
    });

    await expect(create.handler({ amount: 1, description: 'demo' }, makeContext({ walletAddress: DEFAULT_ADDRESS }).context)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });

    const created = makeContext({
      payApiKey: 'pay-key',
      walletAddress: DEFAULT_ADDRESS,
      requestJson: async () => ({ status: 'created' }),
      yes: true,
    });
    await expect(create.handler({ amount: 1, description: 'demo' }, created.context)).resolves.toMatchObject({
      executed: true,
      result: { status: 'created' },
    });
    expect(created.written).toHaveLength(0);

    const showPersist = makeContext({
      payApiKey: 'pay-key',
      walletAddress: DEFAULT_ADDRESS,
      requestJson: async () => ({ status: 'ok' }),
    });
    await expect(show.handler({ sessionId: 'abc' }, showPersist.context)).resolves.toEqual({ status: 'ok' });
    expect(showPersist.written).toHaveLength(1);
    expect(showPersist.written[0]?.path).toContain('checkout-sessions.json');
    expect(showPersist.written[0]?.value).toMatchObject({
      sessions: {
        abc: { orderId: 'abc', status: 'ok' },
      },
    });
  });
});
