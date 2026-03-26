export type OutputFormat = 'json' | 'table';

export type ErrorCategory =
  | 'validation'
  | 'auth'
  | 'network'
  | 'rate_limit'
  | 'contract'
  | 'config'
  | 'api'
  | 'timeout'
  | 'unsupported'
  | 'internal';

export interface CLIErrorBody {
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  suggestion?: string;
  details?: unknown;
}

export interface CLIMeta {
  command: string;
  env: string;
  chain: string;
  timestamp: string;
  duration_ms: number;
}

export type CLIOutput<T> =
  | {
      ok: true;
      data: T;
      error?: never;
      meta: CLIMeta;
    }
  | {
      ok: false;
      data?: never;
      error: CLIErrorBody;
      meta: CLIMeta;
    };
