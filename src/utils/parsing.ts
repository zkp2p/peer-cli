import { createError } from '../output/errors.js';
import { parseJsonInput } from './validation.js';

export function asBigInt(value: unknown, field: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw createError('VALIDATION_ERROR', `${field} must be a whole number, got ${value}.`);
    }
    if (!Number.isSafeInteger(value)) {
      // Past 2^53 a JS number cannot represent the integer exactly and
      // BigInt(value) would carry the rounding error through. Callers with a
      // value this large must pass it as a string.
      throw createError(
        'VALIDATION_ERROR',
        `${field} is too large to pass as a number without losing precision; pass it as a string.`,
      );
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    // BigInt('') is 0n and BigInt('0x10') is 16 — accept only a plain decimal
    // integer so a blank or malformed argument fails loudly instead of silently
    // resolving to the wrong id / amount.
    const trimmed = value.trim();
    if (!/^-?\d+$/.test(trimmed)) {
      throw createError(
        'VALIDATION_ERROR',
        `${field} must be an integer, got ${JSON.stringify(value)}.`,
      );
    }
    return BigInt(trimmed);
  }
  throw createError('VALIDATION_ERROR', `${field} must be a bigint-compatible value.`);
}

export function parseJsonObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const parsed = parseJsonInput(value, field);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  }
  throw createError('VALIDATION_ERROR', `${field} must be a JSON object.`);
}

export function parseJsonArray(value: unknown, field: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      throw createError('VALIDATION_ERROR', `Invalid JSON passed to ${field}.`, { details: error });
    }
  }
  throw createError('VALIDATION_ERROR', `${field} must be a JSON array.`);
}
