import { describe, expect, it, vi } from 'vitest';
import type { CommandExecutionContext } from '../src/commands/framework.js';
import { sdkReadHandler, sdkSeparatePrepareHandler, sdkWriteHandler, mergeParamsWithFile } from '../src/commands/helpers.js';
import { createError, normalizeError } from '../src/output/errors.js';
import { requestJson } from '../src/utils/http.js';

function makeContext(options: { yes?: boolean } = {}) {
  const client = {
    leaf: async () => 'ok',
    prepareLeaf: async () => ({ prepared: { to: '0x1111111111111111111111111111111111111111', data: '0x', value: 0n, chainId: 8453 } }),
    executeLeaf: async () => 'sent',
  };

  return {
    getClient: async () => ({ client, publicClient: {}, walletClient: {} }),
    runPrepared: async (plan: { description?: string; prepare: () => Promise<{ prepared: { to: string; data: string; value: bigint; chainId: number }; previewData?: unknown }>; execute: () => Promise<unknown> }) => {
      const prepared = await plan.prepare();
      if (options.yes) {
        return {
          executed: true,
          preview: {
            to: prepared.prepared.to,
            data: prepared.prepared.data,
            value: prepared.prepared.value.toString(),
            chainId: prepared.prepared.chainId,
            description: plan.description,
          },
          previewData: prepared.previewData,
          result: await plan.execute(),
        };
      }
      return {
        executed: false,
        preview: {
          to: prepared.prepared.to,
          data: prepared.prepared.data,
          value: prepared.prepared.value.toString(),
          chainId: prepared.prepared.chainId,
          description: plan.description,
        },
        previewData: prepared.previewData,
      };
    },
    config: { env: 'production', format: 'json', yes: options.yes ?? false, debug: false },
    globalOptions: {},
    deps: {} as never,
    command: 'peer test',
    spec: {} as never,
    requestJson: async () => undefined,
    readJsonFile: async () => undefined,
    readTextFile: async () => '',
    writeJsonFile: async () => undefined,
  } as unknown as CommandExecutionContext;
}

describe('helper and transport branches', () => {
  it('covers helper error paths and previewData wiring', async () => {
    await expect(
      sdkReadHandler(['missing'], async () => [])({} as never, makeContext()),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });

    await expect(
      sdkWriteHandler(['leaf'], async () => ({ value: 1 }), { requireWallet: false })({} as never, makeContext()),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_OPERATION' });

    const result = await sdkSeparatePrepareHandler(
      ['prepareLeaf'],
      ['executeLeaf'],
      async () => ({ x: 1 }),
      { previewData: (prepared) => prepared },
    )({} as never, makeContext({ yes: true }));
    expect(result).toMatchObject({ executed: true, previewData: { prepared: { to: '0x1111111111111111111111111111111111111111' } } });

    expect(mergeParamsWithFile({ a: 1, b: undefined }, ['a', 'b'], { c: 2 })).toEqual({ c: 2, a: 1, b: undefined });
  });

  it('covers http and normalization fallbacks', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    await expect(requestJson('https://example.test')).rejects.toMatchObject({ code: 'API_ERROR', retryable: true });

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
    })) as unknown as typeof fetch);
    await expect(requestJson('https://example.test')).resolves.toBeUndefined();

    expect(normalizeError({ message: 'unknown', code: 123 })).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(normalizeError({ message: 'unexpected api key failure' })).toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(normalizeError(createError('RATE_LIMITED', 'too many requests'))).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
