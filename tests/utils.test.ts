import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPaymentMethodsCatalog } from '@zkp2p/sdk';
import { requestJson } from '../src/utils/http.js';
import { logDebug, setDebugEnabled } from '../src/utils/logger.js';
import { DEFAULT_CHAIN_ID, SUPPORTED_PLATFORMS } from '../src/utils/constants.js';
import {
  amountToUnits,
  ensureAddress,
  ensureArray,
  ensureBoolean,
  ensureHexPrivateKey,
  ensureNumber,
  ensureOneOf,
  ensurePositiveNumber,
  ensureSupportedCurrency,
  ensureSupportedCurrencyList,
  ensureSupportedPlatform,
  ensureSupportedPlatformList,
  ensureString,
  optionalAmountToUnits,
  parseCsv,
  parseJsonFile,
  parseJsonInput,
} from '../src/utils/validation.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setDebugEnabled(false);
});

describe('validation utils', () => {
  it('keeps supported platforms aligned with the SDK active catalog', () => {
    const activePlatforms = Object.keys(getPaymentMethodsCatalog(DEFAULT_CHAIN_ID, 'production'));
    expect([...SUPPORTED_PLATFORMS].sort()).toEqual(activePlatforms.sort());
  });

  it('parses csv and json input', () => {
    expect(parseCsv(undefined)).toBeUndefined();
    expect(parseCsv(' a, b ,, c ')).toEqual(['a', 'b', 'c']);
    expect(parseJsonInput('{"a":1}', 'field')).toEqual({ a: 1 });
    expect(parseJsonInput(undefined, 'field')).toBeUndefined();
  });

  it('validates primitive values', () => {
    expect(ensureString('  hello ', 'field')).toBe('hello');
    expect(ensureNumber('2.5', 'field')).toBe(2.5);
    expect(ensurePositiveNumber(1, 'field')).toBe(1);
    expect(ensureBoolean(true, 'field')).toBe(true);
    expect(ensureBoolean('false', 'field')).toBe(false);
    expect(ensureArray([1, 2], 'field')).toEqual([1, 2]);
    expect(ensureOneOf('production', 'env', ['production', 'staging'] as const)).toBe('production');
    expect(ensureSupportedCurrency('usd', 'currency')).toBe('USD');
    expect(ensureSupportedCurrencyList(['usd', 'eur'], 'currencies')).toEqual(['USD', 'EUR']);
    expect(ensureSupportedPlatform('WISE', 'platform')).toBe('wise');
    expect(ensureSupportedPlatformList(['WISE', 'venmo'], 'platforms')).toEqual(['wise', 'venmo']);
  });

  it('derives amounts and private keys', () => {
    expect(amountToUnits('1.5', 'amount', 6)).toBe(1_500_000n);
    expect(optionalAmountToUnits('', 'amount', 6)).toBeUndefined();
    expect(optionalAmountToUnits(2, 'amount', 6)).toBe(2_000_000n);
    expect(ensureHexPrivateKey('0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e')).toMatch(/^0x/);
  });

  it('rejects invalid values with helpful errors', () => {
    expect(() => ensureString(' ', 'field')).toThrow('field must be a non-empty string.');
    expect(() => ensureAddress('0x123', 'field')).toThrow('field must be a valid EVM address.');
    expect(() => ensureNumber('abc', 'field')).toThrow('field must be numeric.');
    expect(() => ensurePositiveNumber(0, 'field')).toThrow('field must be greater than zero.');
    expect(() => ensureBoolean('maybe', 'field')).toThrow('field must be a boolean.');
    expect(() => ensureArray({}, 'field')).toThrow('field must be an array.');
    expect(() => ensureOneOf('bad', 'env', ['production', 'staging'] as const)).toThrow('env must be one of: production, staging.');
    expect(() => ensureSupportedCurrency('invalid', 'currency')).toThrow('Unsupported currency: INVALID.');
    expect(() => ensureSupportedPlatform('invalid', 'platform')).toThrow('Unsupported platform: invalid.');
  });

  it('parses json files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'peer-cli-test-'));
    const path = join(dir, 'payload.json');
    await writeFile(path, '{"hello":"world"}');
    await expect(parseJsonFile(path)).resolves.toEqual({ hello: 'world' });
  });
});

describe('logging utils', () => {
  it('prints debug messages only when enabled', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    logDebug('ignored');
    expect(spy).not.toHaveBeenCalled();

    setDebugEnabled(true);
    logDebug('hello', { count: 1 });
    expect(spy.mock.calls.at(-1)?.[0]).toContain('[peer-cli] hello');
    expect(spy.mock.calls.at(-1)?.[0]).toContain('"count":1');
  });
});

describe('requestJson', () => {
  it('sends json requests and parses responses', async () => {
    let requestUrl: string | URL | undefined;
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      requestUrl = input;
      requestInit = init;
      return {
      ok: true,
      status: 200,
      text: async () => '{"value":1}',
      };
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(requestJson<{ value: number }>('https://example.test', { method: 'POST', body: '{}' })).resolves.toEqual({ value: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://example.test', expect.any(Object));
    expect(requestUrl).toBe('https://example.test');
    expect(requestInit).toBeDefined();
    if (!requestInit) {
      throw new Error('expected request init to be defined');
    }
    expect(requestInit).toMatchObject({ method: 'POST', body: '{}' });
    expect(requestInit.headers).toBeInstanceOf(Headers);
    expect((requestInit.headers as Headers).get('content-type')).toBe('application/json');
  });

  it('logs http request and response details in debug mode', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"value":1}',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    setDebugEnabled(true);

    await expect(
      requestJson<{ value: number }>('https://example.test', {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token' },
        body: '{"hello":"world"}',
      }),
    ).resolves.toEqual({ value: 1 });

    const combined = stderrSpy.mock.calls.map((call) => String(call[0])).join('');
    expect(combined).toContain('[peer-cli] HTTP request');
    expect(combined).toContain('[peer-cli] HTTP response');
    expect(combined).toContain('"status":200');
    expect(combined).not.toContain('secret-token');
  });

  it('maps failed responses to peer errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => '{"error":"slow down"}',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(requestJson('https://example.test')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      category: 'rate_limit',
      retryable: true,
    });
  });

  it('maps invalid upstream html to api errors', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      text: async () => '<html>bad gateway</html>',
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    await expect(requestJson('https://example.test')).rejects.toMatchObject({
      code: 'API_ERROR',
      category: 'api',
      retryable: true,
      message: 'Invalid JSON response from https://example.test',
    });
  });

  it('maps aborts to timeout errors', async () => {
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch);

    await expect(requestJson('https://example.test')).rejects.toMatchObject({
      code: 'TIMEOUT',
      category: 'timeout',
    });
  });
});
