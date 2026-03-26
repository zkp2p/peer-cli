import { createError } from '../output/errors.js';
import { parseJsonInput } from './validation.js';

export function asBigInt(value: unknown, field: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return BigInt(value);
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
