import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CommandDefinition, RuntimeDeps } from '../commands/framework.js';
import { executeDefinition } from '../commands/framework.js';
import { buildToolInputShape, buildToolName } from './schemas.js';
import type { GlobalOptions } from '../sdk/config.js';
import type { CLIOutput } from '../output/types.js';

function renderMcpResponse(result: unknown): string {
  return JSON.stringify(
    result,
    (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
    2,
  );
}

function toToolResult(output: CLIOutput<unknown>, isError: boolean): CallToolResult {
  return {
    content: [{ type: 'text', text: renderMcpResponse(output) }],
    structuredContent: output as unknown as Record<string, unknown>,
    isError,
  };
}

export function registerCommandTools(
  server: McpServer,
  definitions: CommandDefinition[],
  globalOptions: GlobalOptions,
  deps?: RuntimeDeps,
  full = false,
): void {
  for (const spec of definitions) {
    if (!full && !spec.readOnly) {
      continue;
    }

    server.registerTool(
      buildToolName(spec),
      {
        description: spec.description,
        inputSchema: buildToolInputShape(spec),
        annotations: {
          readOnlyHint: spec.readOnly,
          destructiveHint: spec.dangerous ?? false,
        },
      },
      async (args) => {
        const output = await executeDefinition(
          spec,
          args as Record<string, unknown>,
          globalOptions,
          deps,
        );

        const ok = output.ok === true;
        return toToolResult(output, !ok);
      },
    );
  }
}
