import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { commandDefinitions } from '../src/commands/registry.js';
import { getPeerConfigPath, readStoredConfig, resolveConfig, writeStoredConfig } from '../src/sdk/config.js';

const previousHome = process.env.HOME;
const previousPeerEnv = process.env.PEER_ENV;
const previousPeerRpcUrl = process.env.PEER_RPC_URL;
const previousPeerBaseApiUrl = process.env.PEER_BASE_API_URL;
const previousPeerMarketBaseUrl = process.env.PEER_MARKET_BASE_URL;
const previousPeerPayBaseUrl = process.env.PEER_PAY_BASE_URL;

afterEach(() => {
  process.env.HOME = previousHome;
  process.env.PEER_ENV = previousPeerEnv;
  process.env.PEER_RPC_URL = previousPeerRpcUrl;
  process.env.PEER_BASE_API_URL = previousPeerBaseApiUrl;
  process.env.PEER_MARKET_BASE_URL = previousPeerMarketBaseUrl;
  process.env.PEER_PAY_BASE_URL = previousPeerPayBaseUrl;
});

async function withHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'peer-cli-config-'));
  process.env.HOME = home;
  return fn(home);
}

function definition(path: string[]): (typeof commandDefinitions)[number] {
  const spec = commandDefinitions.find((entry) => entry.path.join(' ') === path.join(' '));
  if (!spec) {
    throw new Error(`Missing command definition: ${path.join(' ')}`);
  }
  return spec;
}

describe('config precedence branches', () => {
  it('covers stored, env, and default fallbacks', async () => {
    await withHome(async (_home) => {
      await mkdir(dirname(getPeerConfigPath()), { recursive: true });
      await writeFile(getPeerConfigPath(), JSON.stringify({ env: 'staging', rpcUrl: 'https://stored-rpc', marketApiKey: 'stored-market' }));
      process.env.PEER_ENV = 'production';
      process.env.PEER_RPC_URL = 'https://env-rpc';
      process.env.PEER_BASE_API_URL = 'https://env-base';
      process.env.PEER_MARKET_BASE_URL = 'https://env-market';
      process.env.PEER_PAY_BASE_URL = 'https://env-pay';

      await expect(resolveConfig({ format: 'table', yes: true, debug: true, apiKey: 'flag-key', indexerKey: 'indexer', indexerUrl: 'https://indexer', marketApiKey: 'flag-market', payApiKey: 'flag-pay', baseApiUrl: 'https://flag-base', marketBaseUrl: 'https://flag-market', payBaseUrl: 'https://flag-pay' })).resolves.toMatchObject({
        env: 'production',
        format: 'table',
        yes: true,
        debug: true,
        apiKey: 'flag-key',
        indexerKey: 'indexer',
        indexerUrl: 'https://indexer',
        marketApiKey: 'flag-market',
        payApiKey: 'flag-pay',
        baseApiUrl: 'https://flag-base',
        marketBaseUrl: 'https://flag-market',
        payBaseUrl: 'https://flag-pay',
        rpcUrl: 'https://env-rpc',
      });
    });
  });

  it('merges stored config patches', async () => {
    await withHome(async () => {
      await writeStoredConfig({ env: 'staging', apiKey: 'a' });
      await writeStoredConfig({ payApiKey: 'b' });
      await expect(readStoredConfig()).resolves.toMatchObject({ env: 'staging', apiKey: 'a', payApiKey: 'b' });
    });
  });

  it('normalizes config keys and rejects invalid aliases', async () => {
    await withHome(async () => {
      await expect(definition(['config', 'set']).handler({ key: 'wallet', value: '/tmp/wallet.json' }, {} as never)).resolves.toEqual({
        walletPath: '/tmp/wallet.json',
      });
      await expect(definition(['config', 'set']).handler({ key: 'rpc-url', value: 'https://rpc.alias' }, {} as never)).resolves.toEqual({
        walletPath: '/tmp/wallet.json',
        rpcUrl: 'https://rpc.alias',
      });
      await expect(definition(['config', 'set']).handler({ key: 'env', value: 'staging' }, {} as never)).resolves.toMatchObject({
        env: 'staging',
      });
      await expect(definition(['config', 'set']).handler({ key: 'bad-key', value: 'x' }, {} as never)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(definition(['config', 'set']).handler({ key: 'env', value: 'not-an-env' }, {} as never)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });
  });
});
