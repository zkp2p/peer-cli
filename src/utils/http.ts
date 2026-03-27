import { createError } from '../output/errors.js';
import { logDebug } from './logger.js';

export interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
}

function parseJsonResponse(text: string, url: string, status: number, retryable: boolean): unknown {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw createError('API_ERROR', `Invalid JSON response from ${url}`, {
      retryable,
      details: {
        status,
        parseError: error instanceof Error ? error.message : String(error),
        bodyPreview: text.slice(0, 200),
      },
    });
  }
}

export function appendSearchParams(url: URL, values: Record<string, string | number | undefined>): URL {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (['POST', 'PUT', 'PATCH'].includes(method) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    const startedAt = Date.now();
    logDebug('HTTP request', {
      method,
      url,
      timeoutMs,
      headers,
      body: options.body,
    });

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });

    const text = await response.text();
    const retryable = response.status >= 500 || response.status === 429;
    const payload = parseJsonResponse(text, url, response.status, retryable);
    logDebug('HTTP response', {
      method,
      url,
      status: response.status,
      ok: response.ok,
      durationMs: Date.now() - startedAt,
      payload,
    });

    if (!response.ok) {
      throw createError(response.status === 429 ? 'RATE_LIMITED' : 'API_ERROR', `HTTP ${response.status} from ${url}`, {
        retryable,
        details: payload,
      });
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw createError('TIMEOUT', `Request to ${url} timed out.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
