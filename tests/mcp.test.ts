import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockRuntime } from './helpers/mock-runtime.js';
import { buildToolInputShape, buildToolName } from '../src/mcp/schemas.js';
import { registerCommandTools } from '../src/mcp/tools.js';

interface MockServer {
  registerTool: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  name?: string;
  version?: string;
}

const mocks = vi.hoisted(() => {
  const server: MockServer = {
    registerTool: vi.fn(),
    connect: vi.fn(async () => undefined),
  };

  return {
    server,
    mcpServerCtor: vi.fn().mockImplementation((options: { name: string; version: string }) => {
      server.name = options.name;
      server.version = options.version;
      return server;
    }),
    transportCtor: vi.fn().mockImplementation(() => ({ kind: 'stdio-transport' })),
  };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mocks.mcpServerCtor,
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: mocks.transportCtor,
}));

import { createPeerMcpServer, startPeerMcpServer } from '../src/mcp/server.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mcp schema helpers', () => {
  it('builds tool names and zod shapes', () => {
    expect(buildToolName({ path: ['vault', 'set-rate'], description: '', readOnly: false, handler: async () => undefined })).toBe('peer_vault_set_rate');

    const shape = buildToolInputShape({
      path: ['demo'],
      description: 'Demo',
      readOnly: true,
      args: [
        { name: 'owner', description: 'Owner', schema: { type: 'string', description: 'Owner' } },
        { name: 'optional', description: 'Optional', required: false, schema: { type: 'number', description: 'Optional', default: 5 } },
      ],
      options: [
        { name: 'flag', flags: '--flag', description: 'Flag', schema: { type: 'boolean', description: 'Flag' } },
      ],
      handler: async () => undefined,
    });

    expect(shape.owner!.safeParse('alice').success).toBe(true);
    expect(shape.optional!.safeParse(undefined).success).toBe(true);
    expect(shape.flag!.safeParse(true).success).toBe(true);
    expect(shape.params!.safeParse({ raw: true }).success).toBe(true);
  });
});

describe('tool registration', () => {
  it('registers read-only tools by default and invokes handlers', async () => {
    const runtime = createMockRuntime({
      behaviors: {
        getQuote: vi.fn(async () => [{ route: 'fast' }]),
      },
    });

    const definitions = [
      { path: ['quote'], description: 'Quote', readOnly: true, handler: async () => ['ok'] },
      { path: ['transfer'], description: 'Transfer', readOnly: false, handler: async () => ['sent'] },
    ] as const;

    registerCommandTools(mocks.server as never, definitions as never, {}, runtime.deps, false);

    expect(mocks.server.registerTool).toHaveBeenCalledTimes(1);
    const firstCall = mocks.server.registerTool.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [toolName, toolConfig, toolHandler] = firstCall!;
    expect(toolName).toBe('peer_quote');
    expect(toolConfig).toMatchObject({ description: 'Quote', annotations: { readOnlyHint: true } });

    const result = await toolHandler({ from: 'USD', amount: 10 });
    expect(result).toMatchObject({
      isError: false,
      structuredContent: expect.objectContaining({ ok: true }),
    });
    expect(result.content[0].text).toContain('"ok": true');
  });

  it('registers write tools when full mode is enabled', () => {
    registerCommandTools(
      mocks.server as never,
      [{ path: ['transfer'], description: 'Transfer', readOnly: false, handler: async () => 'ok' }] as never,
      {},
      createMockRuntime().deps,
      true,
    );

    expect(mocks.server.registerTool).toHaveBeenCalledWith(
      'peer_transfer',
      expect.objectContaining({
        annotations: { readOnlyHint: false, destructiveHint: false },
      }),
      expect.any(Function),
    );
  });
});

describe('mcp server lifecycle', () => {
  it('constructs the server with the requested version and full flag', async () => {
    createPeerMcpServer({ full: true, version: '9.9.9', globalOptions: { format: 'json' } });
    expect(mocks.mcpServerCtor).toHaveBeenCalledWith({ name: 'peer-cli', version: '9.9.9' });
    expect(mocks.server.registerTool).toHaveBeenCalled();
  });

  it('connects a stdio transport when started', async () => {
    const server = await startPeerMcpServer({ version: '1.2.3' });
    expect(mocks.transportCtor).toHaveBeenCalledTimes(1);
    expect(mocks.server.connect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'stdio-transport' }));
    expect(server).toBe(mocks.server);
  });
});
