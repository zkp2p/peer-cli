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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function renderRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(empty)';
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

function renderKeyValueTable(entries: Array<[string, unknown]>): string {
  return renderRows(entries.map(([key, value]) => ({ Key: key, Value: value })));
}

function renderSection(title: string, body: string): string {
  return `${title}:\n${body}`;
}

function renderTable(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '(empty)';
    if (data.every((item) => isPlainObject(item))) {
      return renderRows(data as Record<string, unknown>[]);
    }
    return renderRows(data.map((item, index) => ({ Index: index, Value: item })));
  }

  if (isPlainObject(data)) {
    const entries = Object.entries(data);
    if (entries.length === 0) return '(empty)';

    const scalarEntries = entries.filter(([, value]) => !isPlainObject(value) && !Array.isArray(value));
    const complexEntries = entries.filter(([, value]) => isPlainObject(value) || Array.isArray(value));
    const sections: string[] = [];

    if (scalarEntries.length > 0) {
      sections.push(renderKeyValueTable(scalarEntries));
    }

    for (const [key, value] of complexEntries) {
      sections.push(renderSection(key, renderTable(value)));
    }

    return sections.join('\n\n');
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
