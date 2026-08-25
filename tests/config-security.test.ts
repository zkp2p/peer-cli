import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeDefinition } from '../src/commands/framework.js';
import { commandDefinitions } from '../src/commands/registry.js';
import { createMockRuntime } from './helpers/mock-runtime.js';

const previousHome = process.env.HOME;

afterEach(() => {
  process.env.HOME = previousHome;
});

function definition(path: string[]): (typeof commandDefinitions)[number] {
  const spec = commandDefinitions.find((entry) => entry.path.join(' ') === path.join(' '));
  if (!spec) {
    throw new Error(`Missing command definition: ${path.join(' ')}`);
  }
  return spec;
}

async function run(path: string[], input: Record<string, unknown>, runtime = createMockRuntime()) {
  return executeDefinition(definition(path), input, {} as never, runtime.deps);
}

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'peer-cli-config-security-'));
  process.env.HOME = home;
  return fn(home);
}

describe('config output safety', () => {
  it('stores config in an owner-only directory and file', async () => {
    await withTempHome(async (home) => {
      await run(['config', 'set'], { key: 'apiKey', value: 'local-api-key' });

      const directoryMode = (await stat(join(home, '.peer'))).mode & 0o777;
      const fileMode = (await stat(join(home, '.peer', 'config.json'))).mode & 0o777;
      expect(directoryMode).toBe(0o700);
      expect(fileMode).toBe(0o600);
    });
  });

  it('masks secrets in config set response', async () => {
    await withTempHome(async () => {
      const result = await run(['config', 'set'], { key: 'apiKey', value: 'super-secret-api-key-12345' });

      expect(result).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          apiKey: 'super-se...',
        }),
      });

      expect(JSON.stringify(result)).not.toContain('super-secret-api-key-12345');
    });
  });

  it('masks persisted private keys in config set responses', async () => {
    await withTempHome(async () => {
      const rawKey = '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e';
      const result = await run(['config', 'set'], { key: 'private-key', value: rawKey });

      expect(result).toMatchObject({
        ok: true,
        data: expect.objectContaining({
          privateKey: '0x59c6...12e',
          walletAddress: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
        }),
      });

      expect(JSON.stringify(result)).not.toContain(rawKey);
    });
  });

  it('masks secrets and adds a wallet address in config show', async () => {
    await withTempHome(async () => {
      const runtime = createMockRuntime({
        config: {
          privateKey: '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e',
          apiKey: 'resolved-api-key',
          marketApiKey: 'resolved-market-key',
        },
      });

      await run(['config', 'set'], { key: 'apiKey', value: 'stored-api-key' }, runtime);
      await run(['config', 'set'], { key: 'payApiKey', value: 'stored-pay-key' }, runtime);

      const show = await run(['config', 'show'], {}, runtime);

      expect(show).toMatchObject({
        ok: true,
        data: {
          stored: expect.objectContaining({
            apiKey: 'stored-a...',
            payApiKey: 'stored-p...',
          }),
          resolved: expect.objectContaining({
            privateKey: '0x59c6...12e',
            walletAddress: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/),
            apiKey: 'resolved...',
            marketApiKey: 'resolved...',
          }),
        },
      });
    });
  });
});
