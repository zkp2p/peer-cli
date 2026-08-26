import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { startPeerMcpHttpServer } from '../src/mcp/server.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

describe('streamable HTTP MCP server', () => {
  it('serves health and executes read-only MCP tools over HTTP', async () => {
    const server = await startPeerMcpHttpServer({
      host: '127.0.0.1',
      port: 0,
      version: '9.9.9',
    });
    cleanups.push(
      () =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    );

    const { port } = server.address() as AddressInfo;
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    await expect(healthResponse.json()).resolves.toEqual({
      ok: true,
      service: 'peer-mcp',
      version: '9.9.9',
      profile: 'read-only',
    });

    const invalidMethodResponse = await fetch(`http://127.0.0.1:${port}/mcp`);
    expect(invalidMethodResponse.status).toBe(405);

    const client = new Client({ name: 'peer-cli-test', version: '1.0.0' });
    cleanups.push(() => client.close());
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
    );

    const tools = await client.listTools();
    expect(tools.tools.some(({ name }) => name === 'peer_config_platforms')).toBe(true);

    const result = await client.callTool({ name: 'peer_config_platforms', arguments: {} });
    expect(result).toMatchObject({
      isError: false,
      structuredContent: {
        ok: true,
      },
    });
  });

  it('rejects write-capable profiles over HTTP', async () => {
    await expect(
      startPeerMcpHttpServer({ host: '127.0.0.1', port: 0, profile: 'full' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
