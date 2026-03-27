import type { CLIErrorBody, ErrorCategory } from './types.js';

export interface ErrorCatalogEntry {
  category: ErrorCategory;
  retryable: boolean;
  suggestion: string;
}

export const ERROR_CATALOG = {
  VALIDATION_ERROR: {
    category: 'validation',
    retryable: false,
    suggestion: 'Inspect the command arguments and re-run with valid values.',
  },
  AUTH_REQUIRED: {
    category: 'auth',
    retryable: false,
    suggestion: 'Provide the missing credential or wallet before retrying.',
  },
  CONFIG_ERROR: {
    category: 'config',
    retryable: false,
    suggestion: 'Update ~/.peer/config.json or pass an explicit flag for the missing setting.',
  },
  API_ERROR: {
    category: 'api',
    retryable: false,
    suggestion: 'Inspect the upstream API response and adjust the request payload.',
  },
  NETWORK_ERROR: {
    category: 'network',
    retryable: true,
    suggestion: 'Retry the command or switch to a healthier RPC/API endpoint.',
  },
  TIMEOUT: {
    category: 'timeout',
    retryable: true,
    suggestion: 'Retry with a longer timeout or a less loaded upstream endpoint.',
  },
  RATE_LIMITED: {
    category: 'rate_limit',
    retryable: true,
    suggestion: 'Wait for the upstream rate limit window to reset before retrying.',
  },
  CONTRACT_ERROR: {
    category: 'contract',
    retryable: false,
    suggestion: 'Inspect the prepared transaction preview or on-chain state before retrying.',
  },
  UNSUPPORTED_OPERATION: {
    category: 'unsupported',
    retryable: false,
    suggestion: 'Use the raw params form or a different command that matches the supported surface.',
  },
  INTERNAL_ERROR: {
    category: 'internal',
    retryable: false,
    suggestion: 'Inspect the stack trace in --debug mode and fix the local command or adapter bug.',
  },
} as const satisfies Record<string, ErrorCatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

export class PeerCliError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly suggestion?: string;
  readonly details?: unknown;

  constructor(code: string, message: string, options: Partial<Omit<CLIErrorBody, 'code' | 'message'>> = {}) {
    super(message);
    const catalogEntry = ERROR_CATALOG[code as ErrorCode];
    this.name = 'PeerCliError';
    this.code = code;
    this.category = options.category ?? catalogEntry?.category ?? 'internal';
    this.retryable = options.retryable ?? catalogEntry?.retryable ?? false;
    this.suggestion = options.suggestion ?? catalogEntry?.suggestion;
    this.details = options.details;
  }
}

export function createError(
  code: string,
  message: string,
  options: Partial<Omit<CLIErrorBody, 'code' | 'message'>> = {},
): PeerCliError {
  return new PeerCliError(code, message, options);
}

function isErrorLike(value: unknown): value is { name?: string; message?: string; code?: string | number; details?: unknown } {
  return typeof value === 'object' && value !== null;
}

export function normalizeError(error: unknown): CLIErrorBody {
  const internalSuggestion = ERROR_CATALOG.INTERNAL_ERROR.suggestion;

  if (error instanceof PeerCliError) {
    return {
      code: error.code,
      category: error.category,
      message: error.message,
      retryable: error.retryable,
      suggestion: error.suggestion,
      details: error.details,
    };
  }

  if (isErrorLike(error)) {
    const message = error.message ?? 'Unknown error';
    const code = typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR';
    const catalogEntry = ERROR_CATALOG[code as ErrorCode];
    const lowered = message.toLowerCase();
    const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;

    if (error.name === 'APIError' || code === 'API') {
      if (status === 429) {
        return {
          code: 'RATE_LIMITED',
          category: 'rate_limit',
          message,
          retryable: true,
          suggestion: ERROR_CATALOG.RATE_LIMITED.suggestion,
          details: error,
        };
      }

      return {
        code: 'API_ERROR',
        category: 'api',
        message,
        retryable: status !== undefined ? status >= 500 : false,
        suggestion: lowered.includes('no quotes found')
          ? 'No upstream liquidity matched the quote request. Try a different amount, currency, or platform, or verify quote API availability.'
          : ERROR_CATALOG.API_ERROR.suggestion,
        details: error,
      };
    }

    if (lowered.includes('timeout')) {
      return {
        code: 'TIMEOUT',
        category: 'timeout',
        message,
        retryable: true,
        suggestion: ERROR_CATALOG.TIMEOUT.suggestion,
        details: error,
      };
    }

    if (lowered.includes('unauthorized') || lowered.includes('api key') || lowered.includes('forbidden')) {
      return {
        code: 'AUTH_REQUIRED',
        category: 'auth',
        message,
        retryable: false,
        suggestion: ERROR_CATALOG.AUTH_REQUIRED.suggestion,
        details: error,
      };
    }

    if (lowered.includes('network') || lowered.includes('fetch') || lowered.includes('econnrefused')) {
      return {
        code: 'NETWORK_ERROR',
        category: 'network',
        message,
        retryable: true,
        suggestion: ERROR_CATALOG.NETWORK_ERROR.suggestion,
        details: error,
      };
    }

    if (lowered.includes('rate limit') || lowered.includes('too many requests')) {
      return {
        code: 'RATE_LIMITED',
        category: 'rate_limit',
        message,
        retryable: true,
        suggestion: ERROR_CATALOG.RATE_LIMITED.suggestion,
        details: error,
      };
    }

    if (lowered.includes('revert') || lowered.includes('contract')) {
      return {
        code: 'CONTRACT_ERROR',
        category: 'contract',
        message,
        retryable: false,
        suggestion: ERROR_CATALOG.CONTRACT_ERROR.suggestion,
        details: error,
      };
    }

    return {
      code,
      category: catalogEntry?.category ?? 'internal',
      message,
      retryable: catalogEntry?.retryable ?? false,
      suggestion: catalogEntry?.suggestion ?? internalSuggestion,
      details: error,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    category: 'internal',
    message: typeof error === 'string' ? error : 'Unknown error',
    retryable: false,
    suggestion: internalSuggestion,
    details: error,
  };
}
