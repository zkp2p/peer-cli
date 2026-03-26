import type { CommandDefinition } from './framework.js';
import { startPeerMcpServer } from '../mcp/server.js';

export const mcpDefinitions: CommandDefinition[] = [
  {
    path: ['mcp'],
    description: 'Start the peer-cli MCP server over stdio.',
    readOnly: true,
    passthrough: true,
    options: [
      { name: 'full', flags: '--full', description: 'Expose write-capable tools as well as read-only tools.', schema: { type: 'boolean', description: 'Expose all tools.' } },
      { name: 'readOnly', flags: '--read-only', description: 'Force read-only tool registration.', schema: { type: 'boolean', description: 'Expose read-only tools only.' } },
    ],
    handler: async (input, context) => {
      await startPeerMcpServer({
        full: Boolean(input.full) && !Boolean(input.readOnly),
        globalOptions: context.globalOptions,
        deps: context.deps,
      });
      return { started: true };
    },
  },
];
