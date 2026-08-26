import type { CommandDefinition } from './framework.js';
import { startPeerMcpHttpServer, startPeerMcpServer } from '../mcp/server.js';
import { createError } from '../output/errors.js';
import { readPackageVersion } from '../utils/package.js';
import { ensureNumber, ensureOneOf, ensureString } from '../utils/validation.js';

const MCP_PROFILES = ['read-only', 'cash', 'full'] as const;
const MCP_TRANSPORTS = ['stdio', 'http'] as const;

export const mcpDefinitions: CommandDefinition[] = [
  {
    path: ['mcp'],
    description: 'Start the peer-cli MCP server over stdio or Streamable HTTP.',
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
      {
        name: 'transport',
        flags: '--transport <transport>',
        description: 'Transport: stdio or http.',
        defaultValue: 'stdio',
        schema: { type: 'string', description: 'MCP transport.', enum: MCP_TRANSPORTS },
      },
      {
        name: 'host',
        flags: '--host <host>',
        description: 'HTTP bind host.',
        defaultValue: '127.0.0.1',
        schema: { type: 'string', description: 'HTTP bind host.' },
      },
      {
        name: 'port',
        flags: '--port <port>',
        description: 'HTTP port. Defaults to PORT or 3000.',
        schema: { type: 'number', description: 'HTTP port.' },
      },
    ],
    handler: async (input, context) => {
      const profile = ensureOneOf(input.profile ?? 'read-only', 'profile', MCP_PROFILES);
      const transport = ensureOneOf(input.transport ?? 'stdio', 'transport', MCP_TRANSPORTS);
      const options = {
        profile,
        globalOptions: context.globalOptions,
        deps: context.deps,
        version: readPackageVersion(),
      };

      if (transport === 'stdio') {
        await startPeerMcpServer(options);
        return undefined;
      }

      const port = ensureNumber(input.port ?? process.env.PORT ?? 3000, 'port');
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw createError('VALIDATION_ERROR', 'port must be an integer from 1 through 65535.');
      }

      await startPeerMcpHttpServer({
        ...options,
        host: ensureString(input.host ?? '127.0.0.1', 'host'),
        port,
      });
      return undefined;
    },
  },
];
