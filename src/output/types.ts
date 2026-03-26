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

export interface CLIOutput<T> {
  ok: boolean;
  data?: T;
  error?: CLIErrorBody;
  meta: CLIMeta;
}
