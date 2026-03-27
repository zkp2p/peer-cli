import { afterEach, describe, expect, it, vi } from 'vitest';
import { setDebugEnabled, logDebug } from '../src/utils/logger.js';
import { readPackageVersion } from '../src/utils/package.js';
import { asBigInt, parseJsonArray, parseJsonObject } from '../src/utils/parsing.js';
import { ensureHexPrivateKey } from '../src/utils/validation.js';
import { normalizeError } from '../src/output/errors.js';
import { renderOutput, buildOutput } from '../src/output/formatter.js';
import type { CLIMeta } from '../src/output/types.js';

afterEach(() => {
  setDebugEnabled(false);
  vi.restoreAllMocks();
});

const DUMMY_META: CLIMeta = {
  command: 'peer test',
  env: 'production',
  chain: 'base',
  timestamp: '2026-01-01T00:00:00.000Z',
  duration_ms: 0,
};

// --- Logger coverage ---

describe('logger sanitizeForDebug coverage', () => {
  it('sanitizes Error objects', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    const err = new Error('boom');
    logDebug('error test', { error: err });
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toContain('boom');
    expect(output).toContain('"name":"Error"');
  });

  it('sanitizes Headers objects', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    const headers = new Headers({ 'x-api-key': 'secret', 'content-type': 'application/json' });
    logDebug('headers test', { headers });
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toContain('[redacted]');
    expect(output).toContain('application/json');
    expect(output).not.toContain('secret');
  });

  it('sanitizes circular references', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    logDebug('circular test', circular);
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toContain('[Circular]');
  });

  it('sanitizes function values', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    logDebug('func test', { handler: function myHandler() {} });
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toContain('[Function myHandler]');
  });

  it('sanitizes bigint values', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    logDebug('bigint test', { amount: 1000000n });
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toContain('1000000');
  });

  it('sanitizes arrays recursively', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    logDebug('array test', { items: [{ apiKey: 'secret' }, 123n] });
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toContain('[redacted]');
    expect(output).toContain('123');
  });

  it('logs without details', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    setDebugEnabled(true);
    logDebug('plain message');
    const output = String(spy.mock.calls.at(-1)?.[0]);
    expect(output).toBe('[peer-cli] plain message\n');
  });
});

// --- Package version coverage ---

describe('readPackageVersion coverage', () => {
  it('returns the current package version', () => {
    const version = readPackageVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

// --- Parsing coverage ---

describe('parsing coverage', () => {
  it('asBigInt handles bigint passthrough', () => {
    expect(asBigInt(42n, 'field')).toBe(42n);
  });

  it('asBigInt rejects invalid types', () => {
    expect(() => asBigInt(null, 'field')).toThrow('field must be a bigint-compatible value.');
    expect(() => asBigInt(undefined, 'field')).toThrow('field must be a bigint-compatible value.');
    expect(() => asBigInt({}, 'field')).toThrow('field must be a bigint-compatible value.');
  });

  it('parseJsonObject accepts object values directly', () => {
    const obj = { key: 'value' };
    expect(parseJsonObject(obj, 'field')).toBe(obj);
  });

  it('parseJsonObject rejects non-object string parse results', () => {
    // parseJsonInput rejects non-object JSON before parseJsonObject can check
    expect(() => parseJsonObject('"just a string"', 'field')).toThrow();
    expect(() => parseJsonObject('[1,2,3]', 'field')).toThrow();
  });

  it('parseJsonObject rejects non-string non-object values', () => {
    expect(() => parseJsonObject(42, 'field')).toThrow('field must be a JSON object.');
    expect(() => parseJsonObject(null, 'field')).toThrow('field must be a JSON object.');
  });

  it('parseJsonArray accepts array values directly', () => {
    expect(parseJsonArray([1, 2], 'field')).toEqual([1, 2]);
  });

  it('parseJsonArray parses JSON string arrays', () => {
    expect(parseJsonArray('[1,2,3]', 'field')).toEqual([1, 2, 3]);
  });

  it('parseJsonArray rejects non-array JSON strings', () => {
    expect(() => parseJsonArray('{"a":1}', 'field')).toThrow('field must be a JSON array.');
  });

  it('parseJsonArray rejects invalid JSON strings', () => {
    expect(() => parseJsonArray('{bad json', 'field')).toThrow('Invalid JSON passed to field.');
  });

  it('parseJsonArray rejects non-string non-array values', () => {
    expect(() => parseJsonArray(42, 'field')).toThrow('field must be a JSON array.');
  });
});

// --- Validation coverage ---

describe('validation edge cases', () => {
  it('ensureHexPrivateKey rejects invalid keys', () => {
    expect(() => ensureHexPrivateKey('0x123')).toThrow('Private key must be a 32-byte hex string');
    expect(() => ensureHexPrivateKey('not-hex')).toThrow('Private key must be a 32-byte hex string');
  });
});

// --- Error normalization coverage ---

describe('normalizeError coverage', () => {
  it('normalizes APIError with 429 status to RATE_LIMITED', () => {
    const error = { name: 'APIError', message: 'Too many', status: 429 };
    const result = normalizeError(error);
    expect(result).toMatchObject({
      code: 'RATE_LIMITED',
      category: 'rate_limit',
      retryable: true,
    });
  });

  it('normalizes APIError without 429 to API_ERROR', () => {
    const error = { name: 'APIError', message: 'Server error', status: 500 };
    const result = normalizeError(error);
    expect(result).toMatchObject({
      code: 'API_ERROR',
      category: 'api',
      retryable: true,
    });
  });

  it('normalizes APIError with no quotes message', () => {
    const error = { name: 'APIError', message: 'No quotes found for the request', status: 404 };
    const result = normalizeError(error);
    expect(result).toMatchObject({
      code: 'API_ERROR',
      suggestion: expect.stringContaining('No upstream liquidity'),
    });
  });

  it('normalizes error with code API', () => {
    const error = { code: 'API', message: 'Bad request' };
    const result = normalizeError(error);
    expect(result).toMatchObject({ code: 'API_ERROR', category: 'api' });
  });

  it('normalizes non-Error non-object values', () => {
    const result = normalizeError('plain string error');
    expect(result).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'plain string error',
    });
  });

  it('normalizes non-string non-object values', () => {
    const result = normalizeError(42);
    expect(result).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Unknown error',
      details: 42,
    });
  });

  it('normalizes GraphQL errors', () => {
    const result = normalizeError({ message: 'GraphQL errors: field not found' });
    expect(result).toMatchObject({
      code: 'VALIDATION_ERROR',
      suggestion: expect.stringContaining('GraphQL'),
    });
  });

  it('normalizes not found errors', () => {
    const result = normalizeError({ message: 'Deposit not found' });
    expect(result).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('normalizes timeout errors', () => {
    const result = normalizeError({ message: 'Request timeout exceeded' });
    expect(result).toMatchObject({ code: 'TIMEOUT', retryable: true });
  });

  it('normalizes unauthorized errors', () => {
    const result = normalizeError({ message: 'Unauthorized access' });
    expect(result).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('normalizes network errors', () => {
    const result = normalizeError({ message: 'Network error: ECONNREFUSED' });
    expect(result).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  it('normalizes rate limit errors by message', () => {
    const result = normalizeError({ message: 'Rate limit exceeded, too many requests' });
    expect(result).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('normalizes contract errors', () => {
    const result = normalizeError({ message: 'Contract revert: insufficient balance' });
    expect(result).toMatchObject({ code: 'CONTRACT_ERROR', retryable: false });
  });

  it('normalizes error-like with catalog code', () => {
    const result = normalizeError({ code: 'TIMEOUT', message: 'took too long' });
    expect(result).toMatchObject({ code: 'TIMEOUT', category: 'timeout', retryable: true });
  });
});

// --- Formatter coverage ---

describe('formatter coverage', () => {
  it('renders bigint in json output', () => {
    const output = buildOutput({ ok: true, data: { value: 123n } }, DUMMY_META);
    const rendered = renderOutput(output, 'json');
    expect(rendered).toContain('"value": "123"');
  });

  it('renders table for primitive data', () => {
    const output = buildOutput({ ok: true, data: 'hello' }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toBe('hello');
  });

  it('renders table for primitive array', () => {
    const output = buildOutput({ ok: true, data: ['a', 'b', 'c'] }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toContain('Index');
    expect(rendered).toContain('Value');
    expect(rendered).toContain('a');
  });

  it('renders table with empty object', () => {
    const output = buildOutput({ ok: true, data: {} }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toBe('(empty)');
  });

  it('renders table with empty array', () => {
    const output = buildOutput({ ok: true, data: [] }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toBe('(empty)');
  });

  it('renders object with long nested value as truncated JSON', () => {
    const longValue = { nested: 'x'.repeat(200) };
    const output = buildOutput({ ok: true, data: [{ big: longValue }] }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toContain('...');
  });

  it('renders error output as json even in table mode', () => {
    const output = buildOutput(
      { ok: false, error: { code: 'TEST', category: 'internal' as const, message: 'fail', retryable: false } },
      DUMMY_META,
    );
    const rendered = renderOutput(output, 'table');
    expect(rendered).toContain('"ok": false');
  });

  it('renders null and undefined as empty in table', () => {
    const output = buildOutput({ ok: true, data: { a: null, b: undefined, c: 'val' } }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toContain('val');
  });

  it('renders bigint in table cells', () => {
    const output = buildOutput({ ok: true, data: { amount: 1000n } }, DUMMY_META);
    const rendered = renderOutput(output, 'table');
    expect(rendered).toContain('1000');
  });
});
