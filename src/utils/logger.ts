let debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

export function logDebug(message: string, details?: unknown): void {
  if (!debugEnabled) return;
  const suffix = details === undefined ? '' : ` ${JSON.stringify(details, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))}`;
  process.stderr.write(`[peer-cli] ${message}${suffix}\n`);
}
