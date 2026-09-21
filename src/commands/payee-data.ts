import { createError } from '../output/errors.js';
import { parseJsonArray } from '../utils/parsing.js';
import { ensureSupportedPlatformList, parseCsv } from '../utils/validation.js';

const PLATFORM_PAYEE_KEY_ALIASES = [
  ['email', 'email'],
  ['handle', 'handle'],
  ['phone', 'phone'],
  ['username', 'username'],
  ['tag', 'tag'],
] as const;

function normalizePayeeDetailEntry(entry: Record<string, unknown>, processorName: string): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  const lowerProcessorName = processorName.toLowerCase();

  for (const [key, value] of Object.entries(entry)) {
    const lowerKey = key.toLowerCase();
    const alias = PLATFORM_PAYEE_KEY_ALIASES.find(([suffix]) => lowerKey === `${lowerProcessorName}${suffix}`);
    const normalizedKey = alias?.[1] ?? key;

    if (normalizedKey in normalized && key !== normalizedKey) {
      continue;
    }

    normalized[normalizedKey] = value;
  }

  return normalized;
}

export function parseProcessorNames(value: unknown, fieldName: string): string[] {
  return ensureSupportedPlatformList(parseCsv(value as string | undefined), fieldName) ?? [];
}

export function parsePayeeDepositData(
  value: unknown,
  processorNames: string[],
  options: {
    requiredMessage?: string;
    missingDetails?: Record<string, unknown>;
  } = {},
): Record<string, unknown>[] {
  if (processorNames.length === 0) {
    return value ? (parseJsonArray(value, 'depositData') as Record<string, unknown>[]) : [];
  }

  if (!value) {
    throw createError(
      'VALIDATION_ERROR',
      options.requiredMessage ?? 'Provide --deposit-data as a JSON array with one platform-specific detail object per entry in --platforms.',
      options.missingDetails ? { details: options.missingDetails } : {},
    );
  }

  const depositData = parseJsonArray(value, 'depositData');
  if (depositData.length !== processorNames.length) {
    throw createError(
      'VALIDATION_ERROR',
      `--deposit-data must contain exactly one object per platform in --platforms (${processorNames.length} platform(s), ${depositData.length} entr${depositData.length === 1 ? 'y' : 'ies'} provided).`,
      {
        details: {
          platforms: processorNames,
          expectedLength: processorNames.length,
          actualLength: depositData.length,
        },
      },
    );
  }

  return depositData.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw createError('VALIDATION_ERROR', `depositData[${index}] must be a JSON object.`, {
        details: {
          platforms: processorNames,
          index,
          value: entry,
        },
      });
    }

    return normalizePayeeDetailEntry(entry as Record<string, unknown>, processorNames[index] ?? '');
  });
}
