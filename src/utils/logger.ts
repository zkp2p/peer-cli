let debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

const SENSITIVE_KEY_PATTERN = /^(private.?key|api.?key|indexer.?key|market.?api.?key|pay.?api.?key|authorization|cookie|set-cookie|x-api-key)$/i;

function sanitizeForDebug(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    const extra = value as unknown as Record<string, unknown>;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...extra,
    };
  }

  if (value instanceof Headers) {
    return sanitizeForDebug(Object.fromEntries(value.entries()), seen);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForDebug(entry, seen));
  }

  if (value && typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeForDebug(entry, seen),
      ]),
    );
  }

  if (typeof value === 'function') {
    return `[Function ${(value as { name?: string }).name ?? 'anonymous'}]`;
  }

  return value;
}

export function logDebug(message: string, details?: unknown): void {
  if (!debugEnabled) return;
  const suffix = details === undefined ? '' : ` ${JSON.stringify(sanitizeForDebug(details))}`;
  process.stderr.write(`[peer-cli] ${message}${suffix}\n`);
}
