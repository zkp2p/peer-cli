import { isAddress, parseUnits } from 'viem';
import { createError } from '../output/errors.js';
import { SUPPORTED_CURRENCIES, SUPPORTED_PLATFORMS } from './constants.js';

export function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function parseJsonInput(value: string | undefined, fieldName: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Expected a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw createError('VALIDATION_ERROR', `Invalid JSON passed to ${fieldName}.`, { details: error });
  }
}

export async function parseJsonFile(path: string | undefined): Promise<Record<string, unknown> | undefined> {
  if (!path) return undefined;
  const { readFile } = await import('node:fs/promises');
  const raw = await readFile(path, 'utf8');
  return parseJsonInput(raw, path);
}

export function ensureString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw createError('VALIDATION_ERROR', `${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

export function ensureAddress(value: unknown, fieldName: string): `0x${string}` {
  const candidate = ensureString(value, fieldName);
  if (!isAddress(candidate)) {
    throw createError('VALIDATION_ERROR', `${fieldName} must be a valid EVM address.`, { details: { value } });
  }
  return candidate;
}

export function ensureNumber(value: unknown, fieldName: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw createError('VALIDATION_ERROR', `${fieldName} must be numeric.`, { details: { value } });
  }
  return parsed;
}

export function ensurePositiveNumber(value: unknown, fieldName: string): number {
  const parsed = ensureNumber(value, fieldName);
  if (parsed <= 0) {
    throw createError('VALIDATION_ERROR', `${fieldName} must be greater than zero.`, { details: { value } });
  }
  return parsed;
}

export function ensureBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw createError('VALIDATION_ERROR', `${fieldName} must be a boolean.`, { details: { value } });
}

export function ensureArray(value: unknown, fieldName: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw createError('VALIDATION_ERROR', `${fieldName} must be an array.`, { details: { value } });
}

export function ensureOneOf<T extends readonly string[]>(value: unknown, fieldName: string, allowed: T): T[number] {
  const parsed = ensureString(value, fieldName);
  if (!allowed.includes(parsed)) {
    throw createError('VALIDATION_ERROR', `${fieldName} must be one of: ${allowed.join(', ')}.`, {
      details: { value, allowed },
    });
  }
  return parsed as T[number];
}

function ensureSupportedValue<T extends readonly string[]>(
  value: unknown,
  normalized: string,
  allowed: T,
  kind: 'currency' | 'platform',
): T[number] {
  if (!allowed.includes(normalized as T[number])) {
    throw createError('VALIDATION_ERROR', `Unsupported ${kind}: ${normalized}. Must be one of: ${allowed.join(', ')}.`, {
      details: { value, allowed },
    });
  }
  return normalized as T[number];
}

export function ensureSupportedCurrency(value: unknown, fieldName: string): (typeof SUPPORTED_CURRENCIES)[number] {
  const parsed = ensureString(value, fieldName).toUpperCase();
  return ensureSupportedValue(value, parsed, SUPPORTED_CURRENCIES, 'currency');
}

export function ensureSupportedCurrencyList(values: string[] | undefined, fieldName: string): string[] | undefined {
  return values?.map((value, index) => ensureSupportedCurrency(value, `${fieldName}[${index}]`));
}

export function ensureSupportedPlatform(value: unknown, fieldName: string): (typeof SUPPORTED_PLATFORMS)[number] {
  const parsed = ensureString(value, fieldName).toLowerCase();
  return ensureSupportedValue(value, parsed, SUPPORTED_PLATFORMS, 'platform');
}

export function ensureSupportedPlatformList(values: string[] | undefined, fieldName: string): string[] | undefined {
  return values?.map((value, index) => ensureSupportedPlatform(value, `${fieldName}[${index}]`));
}

export function amountToUnits(value: unknown, fieldName: string, decimals = 6): bigint {
  const parsed = ensurePositiveNumber(value, fieldName);
  const minUnit = 1 / 10 ** decimals;
  if (parsed < minUnit) {
    // parseUnits would round this to 0n, silently turning a nonzero request into
    // a no-op transfer/approve.
    throw createError('VALIDATION_ERROR', `${fieldName} must be at least ${minUnit}, got ${value}.`, {
      details: { value, minimum: minUnit },
    });
  }
  if (parsed >= 1e21) {
    // Number#toFixed and Number#toString both switch to exponential notation at
    // 1e21, which parseUnits rejects; an amount this large is not a real input.
    throw createError('VALIDATION_ERROR', `${fieldName} is implausibly large: ${value}.`, {
      details: { value },
    });
  }
  // toFixed keeps plain decimal notation (toString emits '1e-7' for small
  // magnitudes, which parseUnits throws on) and caps the fraction at `decimals`.
  return parseUnits(parsed.toFixed(decimals), decimals);
}

export function optionalAmountToUnits(value: unknown, fieldName: string, decimals = 6): bigint | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return amountToUnits(value, fieldName, decimals);
}

export function ensureHexPrivateKey(value: unknown): `0x${string}` {
  const parsed = ensureString(value, 'private key');
  if (!/^0x[a-fA-F0-9]{64}$/.test(parsed)) {
    throw createError('VALIDATION_ERROR', 'Private key must be a 32-byte hex string prefixed with 0x.');
  }
  return parsed as `0x${string}`;
}
