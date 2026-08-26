import type { Server as HttpServer } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { commandDefinitions } from '../commands/registry.js';
import type { RuntimeDeps } from '../commands/framework.js';
import { registerPeerCashTools, type PeerCashMcpConfig } from './cash.js';
import { registerCommandTools } from './tools.js';
import type { GlobalOptions } from '../sdk/config.js';
import { createError, normalizeError } from '../output/errors.js';
import { readPackageVersion } from '../utils/package.js';

export interface PeerMcpOptions {
  profile?: PeerMcpProfile;
  globalOptions?: GlobalOptions;
  deps?: RuntimeDeps;
  cash?: PeerCashMcpConfig;
  version?: string;
}

export interface PeerMcpHttpOptions extends PeerMcpOptions {
  host?: string;
  port?: number;
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

export async function startPeerMcpHttpServer(
  options: PeerMcpHttpOptions = {},
): Promise<HttpServer> {
  const profile = options.profile ?? 'read-only';
  if (profile !== 'read-only') {
    throw createError(
      'VALIDATION_ERROR',
      'Streamable HTTP only supports the read-only profile. Use stdio for cash or full authority.',
    );
  }

  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const version = options.version ?? readPackageVersion();
  const app = createMcpExpressApp({ host });

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'peer-mcp', version, profile });
  });

  app.post('/mcp', async (request, response) => {
    const server = createPeerMcpServer({ ...options, profile, version });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      const normalized = normalizeError(error);
      process.stderr.write(
        `${JSON.stringify({ level: 'error', service: 'peer-mcp', code: normalized.code })}\n`,
      );
      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });

  app.all('/mcp', (_request, response) => {
    response.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed' },
      id: null,
    });
  });

  return new Promise((resolve, reject) => {
    const httpServer = app.listen(port, host);
    httpServer.requestTimeout = 120_000;
    httpServer.headersTimeout = 10_000;
    httpServer.keepAliveTimeout = 5_000;
    httpServer.once('listening', () => resolve(httpServer));
    httpServer.once('error', reject);
  });
}
