import { createError } from '../output/errors.js';

export interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (['POST', 'PUT', 'PATCH'].includes(method) && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
    });

    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : undefined;

    if (!response.ok) {
      throw createError(response.status === 429 ? 'RATE_LIMITED' : 'API_ERROR', `HTTP ${response.status} from ${url}`, {
        retryable: response.status >= 500 || response.status === 429,
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
