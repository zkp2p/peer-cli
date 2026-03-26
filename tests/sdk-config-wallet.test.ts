import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getCheckoutCachePath,
  getPeerConfigDir,
  getPeerConfigPath,
  readStoredConfig,
  resolveConfig,
  type ResolvedConfig,
  writeStoredConfig,
} from '../src/sdk/config.js';
import { resolveAccount, resolvePrivateKey } from '../src/sdk/wallet.js';
import { createError } from '../src/output/errors.js';

const previousHome = process.env.HOME;
const previousPeerEnv = process.env.PEER_ENV;
const previousPeerPrivateKey = process.env.PEER_PRIVATE_KEY;
const previousPeerWalletPath = process.env.PEER_WALLET_PATH;
const previousPeerRpcUrl = process.env.PEER_RPC_URL;
const previousPeerBaseApiUrl = process.env.PEER_BASE_API_URL;
const previousPeerMarketBaseUrl = process.env.PEER_MARKET_BASE_URL;
const previousPeerPayBaseUrl = process.env.PEER_PAY_BASE_URL;

afterEach(() => {
  process.env.HOME = previousHome;
  process.env.PEER_ENV = previousPeerEnv;
  process.env.PEER_PRIVATE_KEY = previousPeerPrivateKey;
  process.env.PEER_WALLET_PATH = previousPeerWalletPath;
  process.env.PEER_RPC_URL = previousPeerRpcUrl;
  process.env.PEER_BASE_API_URL = previousPeerBaseApiUrl;
  process.env.PEER_MARKET_BASE_URL = previousPeerMarketBaseUrl;
  process.env.PEER_PAY_BASE_URL = previousPeerPayBaseUrl;
});

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'peer-cli-home-'));
  process.env.HOME = home;
  return fn(home);
}

function makeConfig(partial: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    env: partial.env ?? 'production',
    format: partial.format ?? 'json',
    yes: partial.yes ?? false,
    debug: partial.debug ?? false,
    walletPath: partial.walletPath,
    rpcUrl: partial.rpcUrl ?? 'https://mainnet.base.org',
    apiKey: partial.apiKey,
    indexerKey: partial.indexerKey,
    indexerUrl: partial.indexerUrl,
    marketApiKey: partial.marketApiKey,
    payApiKey: partial.payApiKey,
    baseApiUrl: partial.baseApiUrl ?? 'https://api.zkp2p.xyz',
    marketBaseUrl: partial.marketBaseUrl ?? 'https://api.peerlytics.xyz',
    payBaseUrl: partial.payBaseUrl ?? 'https://api.pay.zkp2p.xyz',
    privateKey: partial.privateKey,
  };
}

describe('config helpers', () => {
  it('derives config paths from the active home directory', async () => {
    await withTempHome(async (home) => {
      expect(getPeerConfigDir()).toBe(join(home, '.peer'));
      expect(getPeerConfigPath()).toBe(join(home, '.peer', 'config.json'));
      expect(getCheckoutCachePath()).toBe(join(home, '.peer', 'checkout-sessions.json'));
    });
  });

  it('reads and writes stored config', async () => {
    await withTempHome(async () => {
      expect(await readStoredConfig()).toEqual({});
      await expect(writeStoredConfig({ env: 'staging', apiKey: 'abc' })).resolves.toEqual({ env: 'staging', apiKey: 'abc' });
      await expect(readStoredConfig()).resolves.toEqual({ env: 'staging', apiKey: 'abc' });
    });
  });

  it('wraps invalid stored config errors', async () => {
    await withTempHome(async () => {
      const path = getPeerConfigPath();
      await mkdir(join(process.env.HOME ?? '', '.peer'), { recursive: true });
      await writeFile(path, '{');
      await expect(readStoredConfig()).rejects.toMatchObject({
        code: 'CONFIG_ERROR',
        category: 'config',
      });
    });
  });

  it('resolves config from stored, env, and flags', async () => {
    await withTempHome(async () => {
      await writeStoredConfig({
        walletPath: '/tmp/wallet.json',
        rpcUrl: 'https://rpc.stored',
        marketApiKey: 'stored-market',
        payApiKey: 'stored-pay',
      });
      process.env.PEER_ENV = 'staging';
      process.env.PEER_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e';
      process.env.PEER_RPC_URL = 'https://rpc.env';
      process.env.PEER_BASE_API_URL = 'https://base.env';
      process.env.PEER_MARKET_BASE_URL = 'https://market.env';
      process.env.PEER_PAY_BASE_URL = 'https://pay.env';

      await expect(
        resolveConfig({
          format: 'table',
          yes: true,
          debug: true,
          walletPath: '/tmp/override-wallet.json',
          indexerUrl: 'https://indexer.flag',
        }),
      ).resolves.toMatchObject({
        env: 'staging',
        format: 'table',
        yes: true,
        debug: true,
        privateKey: process.env.PEER_PRIVATE_KEY,
        walletPath: '/tmp/override-wallet.json',
        rpcUrl: 'https://rpc.env',
        baseApiUrl: 'https://base.env',
        marketBaseUrl: 'https://market.env',
        payBaseUrl: 'https://pay.env',
        indexerUrl: 'https://indexer.flag',
      });
    });
  });
});

describe('wallet helpers', () => {
  it('resolves private keys from config, files, and fallback rules', async () => {
    await withTempHome(async () => {
      const rawKey = '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e';
      await expect(resolvePrivateKey(makeConfig({ privateKey: rawKey }), true)).resolves.toBe(rawKey);

      const walletFile = join(await mkdtemp(join(tmpdir(), 'peer-cli-wallet-')), 'wallet.json');
      await writeFile(walletFile, JSON.stringify({ privateKey: rawKey }));
      await expect(resolvePrivateKey(makeConfig({ walletPath: walletFile }), true)).resolves.toBe(rawKey);

      await expect(resolvePrivateKey(makeConfig(), false)).resolves.toBe(
        '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e',
      );

      await expect(resolvePrivateKey(makeConfig(), true)).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      });
    });
  });

  it('derives an account from the resolved private key', async () => {
    const account = await resolveAccount(makeConfig({ privateKey: '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e' }), true);
    expect(account.address).toMatch(/^0x/);
  });

  it('exposes config errors as peer errors', () => {
    expect(createError('AUTH_REQUIRED', 'missing')).toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
