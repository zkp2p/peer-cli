import type { CommandDefinition } from './framework.js';
import { startPeerMcpServer } from '../mcp/server.js';
import { readPackageVersion } from '../utils/package.js';
import { ensureOneOf } from '../utils/validation.js';

const MCP_PROFILES = ['read-only', 'cash', 'full'] as const;

export const mcpDefinitions: CommandDefinition[] = [
  {
    path: ['mcp'],
    description: 'Start the peer-cli MCP server over stdio.',
    readOnly: true,
    passthrough: true,
    exposeInMcp: false,
    options: [
      {
        name: 'profile',
        flags: '--profile <profile>',
        description: 'Tool profile: read-only, cash, or full.',
        defaultValue: 'read-only',
        schema: { type: 'string', description: 'MCP tool profile.', enum: MCP_PROFILES },
      },
    ],
    handler: async (input, context) => {
      await startPeerMcpServer({
        profile: ensureOneOf(input.profile ?? 'read-only', 'profile', MCP_PROFILES),
        globalOptions: context.globalOptions,
        deps: context.deps,
        version: readPackageVersion(),
      });
      return undefined;
    },
  },
];
