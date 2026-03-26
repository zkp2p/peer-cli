import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandDefinitions } from '../commands/registry.js';
import type { RuntimeDeps } from '../commands/framework.js';
import { registerCommandTools } from './tools.js';
import type { GlobalOptions } from '../sdk/config.js';

export interface PeerMcpOptions {
  full?: boolean;
  globalOptions?: GlobalOptions;
  deps?: RuntimeDeps;
  version?: string;
}

export function createPeerMcpServer(options: PeerMcpOptions = {}): McpServer {
  const server = new McpServer({
    name: 'peer-cli',
    version: options.version ?? '0.1.0',
  });

  registerCommandTools(
    server,
    commandDefinitions,
    options.globalOptions ?? {},
    options.deps,
    Boolean(options.full),
  );

  return server;
}

export async function startPeerMcpServer(options: PeerMcpOptions = {}): Promise<McpServer> {
  const server = createPeerMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
