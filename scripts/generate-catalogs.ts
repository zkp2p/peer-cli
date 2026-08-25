import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { commandDefinitions } from '../src/commands/registry.js';
import { buildInputSchema } from '../src/commands/framework.js';
import { ERROR_CATALOG } from '../src/output/errors.js';
import {
  PEER_CASH_READ_TOOL_NAMES,
  PEER_CASH_WRITE_TOOL_NAMES,
} from '../src/mcp/cash.js';

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
  const runtimeManifestPath = resolve('agents/runtime-manifest.json');
  const mcpDefinitions = commandDefinitions.filter(
    (definition) => definition.exposeInMcp !== false,
  );
  const mcpReadOnlyCount = mcpDefinitions.filter(
    (definition) => definition.readOnly,
  ).length;
  const runtimeManifest = {
    schema_version: 1,
    package: '@zkp2p/peer-cli',
    source: {
      commands: 'src/commands/registry.ts',
      cash_tools: 'src/mcp/cash.ts',
      errors: 'src/output/errors.ts',
    },
    cli: {
      commands: commandDefinitions.length,
      read_only: commandDefinitions.filter((definition) => definition.readOnly)
        .length,
      write: commandDefinitions.filter((definition) => !definition.readOnly)
        .length,
    },
    mcp: {
      profiles: {
        'read-only': {
          tools: mcpReadOnlyCount + PEER_CASH_READ_TOOL_NAMES.length,
          signs_or_broadcasts: false,
        },
        cash: {
          tools:
            PEER_CASH_READ_TOOL_NAMES.length + PEER_CASH_WRITE_TOOL_NAMES.length,
          signs_or_broadcasts: false,
        },
        full: {
          tools:
            mcpDefinitions.length +
            PEER_CASH_READ_TOOL_NAMES.length +
            PEER_CASH_WRITE_TOOL_NAMES.length,
          signs_or_broadcasts: 'only when the MCP process starts with --yes',
        },
      },
    },
  };

  await mkdir(dirname(toolCatalogPath), { recursive: true });
  await writeFile(toolCatalogPath, JSON.stringify(toolCatalog, null, 2));
  await writeFile(errorCatalogPath, JSON.stringify(errorCatalog, null, 2));
  await writeFile(runtimeManifestPath, JSON.stringify(runtimeManifest, null, 2));
}

void main();
