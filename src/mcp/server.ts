import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandDefinitions } from '../commands/registry.js';
import type { RuntimeDeps } from '../commands/framework.js';
import { registerPeerCashTools, type PeerCashMcpConfig } from './cash.js';
import { registerCommandTools } from './tools.js';
import type { GlobalOptions } from '../sdk/config.js';
import { readPackageVersion } from '../utils/package.js';

export interface PeerMcpOptions {
  profile?: PeerMcpProfile;
  globalOptions?: GlobalOptions;
  deps?: RuntimeDeps;
  cash?: PeerCashMcpConfig;
  version?: string;
}

export type PeerMcpProfile = 'read-only' | 'cash' | 'full';

export function createPeerMcpServer(options: PeerMcpOptions = {}): McpServer {
  const profile = options.profile ?? 'read-only';
  const server = new McpServer({
    name: 'peer-cli',
    version: options.version ?? readPackageVersion(),
  });

  if (profile !== 'cash') {
    registerCommandTools(
      server,
      commandDefinitions,
      options.globalOptions ?? {},
      options.deps,
      profile === 'full',
    );
  }

  registerPeerCashTools(server, {
    config: options.cash,
    globalOptions: options.globalOptions,
    includeWrites: profile !== 'read-only',
  });

  return server;
}

export async function startPeerMcpServer(options: PeerMcpOptions = {}): Promise<McpServer> {
  const server = createPeerMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
