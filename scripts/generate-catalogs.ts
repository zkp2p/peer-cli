import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { commandDefinitions } from '../src/commands/registry.js';
import { buildInputSchema } from '../src/commands/framework.js';
import { ERROR_CATALOG } from '../src/output/errors.js';

function commandName(path: string[]): string {
  return `peer ${path.join(' ')}`;
}

async function main(): Promise<void> {
  const toolCatalog = commandDefinitions.map((definition) => ({
    name: commandName(definition.path),
    path: definition.path,
    description: definition.description,
    parameter_schema: buildInputSchema(definition),
    auth_required: Boolean(definition.requireWallet || definition.authRequired),
    dangerous: Boolean(definition.dangerous),
    read_only: definition.readOnly,
  }));

  const errorCatalog = Object.entries(ERROR_CATALOG).map(([code, entry]) => ({
    code,
    category: entry.category,
    retryable: entry.retryable,
    retry_after_ms: null,
    suggestion: entry.suggestion,
    docs_url: null,
  }));

  const toolCatalogPath = resolve('agents/tool-catalog.json');
  const errorCatalogPath = resolve('agents/error-catalog.json');

  await mkdir(dirname(toolCatalogPath), { recursive: true });
  await writeFile(toolCatalogPath, JSON.stringify(toolCatalog, null, 2));
  await writeFile(errorCatalogPath, JSON.stringify(errorCatalog, null, 2));
}

void main();
