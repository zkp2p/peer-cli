import { createError } from '../output/errors.js';

export interface RequestJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
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
