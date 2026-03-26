import type { CLIErrorBody, CLIMeta, CLIOutput, OutputFormat } from './types.js';

function stringifyJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === 'bigint') {
        return current.toString();
      }
      return current;
    },
    2,
  );
}

function renderPrimitive(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    const rendered = stringifyJson(value);
    return rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered;
  }
  return String(value);
}

function renderTable(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)';
    const rows: Record<string, unknown>[] = data.map((item) =>
      typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : { value: item },
    );
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const widths = headers.map((header) =>
      Math.max(header.length, ...rows.map((row) => renderPrimitive(row[header]).length)),
    );
    const line = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index] ?? 0, ' ')).join(' | ');
    return [
      line(headers),
      widths.map((width) => '-'.repeat(width)).join('-|-'),
      ...rows.map((row) => line(headers.map((header) => renderPrimitive(row[header])))),
    ].join('\n');
  }

  if (typeof data === 'object' && data !== null) {
    return Object.entries(data as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${renderPrimitive(value)}`)
      .join('\n');
  }

  return renderPrimitive(data);
}

export function buildOutput<T>(payload: { ok: true; data: T } | { ok: false; error: CLIErrorBody }, meta: CLIMeta): CLIOutput<T> {
  if (payload.ok) {
    return {
      ok: true,
      data: payload.data,
      meta,
    };
  }

  return {
    ok: false,
    error: payload.error,
    meta,
  };
}

export function renderOutput<T>(output: CLIOutput<T>, format: OutputFormat): string {
  if (format === 'table' && output.ok) {
    return renderTable(output.data);
  }
  return stringifyJson(output);
}
