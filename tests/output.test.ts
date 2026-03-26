import { describe, expect, it } from 'vitest';
import { buildOutput, renderOutput } from '../src/output/formatter.js';
import { createError, normalizeError, PeerCliError } from '../src/output/errors.js';
import type { CLIErrorBody } from '../src/output/types.js';

describe('output helpers', () => {
  it('builds ok and error payloads', () => {
    const meta = {
      command: 'peer quote',
      env: 'production',
      chain: 'base',
      timestamp: '2024-01-01T00:00:00.000Z',
      duration_ms: 1,
    };

    expect(buildOutput({ ok: true, data: { value: 1 } }, meta)).toEqual({
      ok: true,
      data: { value: 1 },
      meta,
    });

    expect(buildOutput({ ok: false, error: { code: 'X', category: 'internal', message: 'bad', retryable: false } }, meta)).toEqual({
      ok: false,
      error: { code: 'X', category: 'internal', message: 'bad', retryable: false },
      meta,
    });
  });

  it('renders json and table output, including bigint values', () => {
    const meta = {
      command: 'peer balance',
      env: 'production',
      chain: 'base',
      timestamp: '2024-01-01T00:00:00.000Z',
      duration_ms: 1,
    };

    expect(renderOutput({ ok: true, data: { amount: 12n }, meta }, 'json')).toContain('"12"');
    expect(renderOutput({ ok: true, data: [{ name: 'alice', amount: 12n }], meta }, 'table')).toContain('alice');
    expect(renderOutput({ ok: true, data: [], meta }, 'table')).toBe('(empty)');
    const errorBody: CLIErrorBody = { code: 'X', category: 'internal', message: 'bad', retryable: false };
    expect(renderOutput({ ok: false, error: errorBody, meta }, 'json')).toContain('"ok": false');
  });
});

describe('error normalization', () => {
  it('preserves PeerCliError details', () => {
    const error = createError('AUTH_REQUIRED', 'Missing key', { details: { field: 'apiKey' } });
    expect(normalizeError(error)).toMatchObject({
      code: 'AUTH_REQUIRED',
      category: 'auth',
      message: 'Missing key',
      retryable: false,
      details: { field: 'apiKey' },
    });
    expect(error).toBeInstanceOf(PeerCliError);
  });

  it('maps common error messages to catalog categories', () => {
    expect(normalizeError(new Error('timeout while fetching'))).toMatchObject({ code: 'TIMEOUT', category: 'timeout' });
    expect(normalizeError(new Error('Unauthorized api key'))).toMatchObject({ code: 'AUTH_REQUIRED', category: 'auth' });
    expect(normalizeError(new Error('network fetch failed'))).toMatchObject({ code: 'NETWORK_ERROR', category: 'network' });
    expect(normalizeError(new Error('forbidden'))).toMatchObject({ code: 'AUTH_REQUIRED', category: 'auth' });
    expect(normalizeError(new Error('ECONNREFUSED'))).toMatchObject({ code: 'NETWORK_ERROR', category: 'network' });
    expect(normalizeError(new Error('too many requests'))).toMatchObject({ code: 'RATE_LIMITED', category: 'rate_limit' });
    expect(normalizeError(new Error('contract revert'))).toMatchObject({ code: 'CONTRACT_ERROR', category: 'contract' });
    expect(normalizeError({ code: 'TIMEOUT' })).toMatchObject({ code: 'TIMEOUT', category: 'timeout', message: 'Unknown error' });
    expect(normalizeError({ message: 'mystery', code: 'SOMETHING' })).toMatchObject({ code: 'SOMETHING', category: 'internal' });
  });

  it('falls back to internal errors for unknown inputs', () => {
    expect(normalizeError('boom')).toMatchObject({ code: 'INTERNAL_ERROR', category: 'internal', message: 'boom' });
  });
});
