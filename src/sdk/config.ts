import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createError } from '../output/errors.js';
import {
  DEFAULT_BASE_API_URLS,
  DEFAULT_MARKET_API_URL,
  DEFAULT_PAY_API_URL,
  DEFAULT_RPC_URL,
  PEER_CHECKOUT_CACHE_FILE,
  PEER_CONFIG_DIR,
  PEER_CONFIG_FILE,
  SUPPORTED_ENVS,
  SUPPORTED_FORMATS,
} from '../utils/constants.js';
import { ensureOneOf } from '../utils/validation.js';
import type { OutputFormat } from '../output/types.js';
import { logDebug } from '../utils/logger.js';

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

export type PeerEnv = (typeof SUPPORTED_ENVS)[number];

export interface GlobalOptions {
  env?: PeerEnv;
  privateKey?: string;
  walletPath?: string;
  rpcUrl?: string;
  apiKey?: string;
  indexerKey?: string;
  indexerUrl?: string;
  marketApiKey?: string;
  payApiKey?: string;
  baseApiUrl?: string;
  marketBaseUrl?: string;
  payBaseUrl?: string;
  format?: OutputFormat;
  yes?: boolean;
  debug?: boolean;
}

export interface StoredConfig {
  env?: PeerEnv;
  privateKey?: string;
  walletPath?: string;
  rpcUrl?: string;
  apiKey?: string;
  indexerKey?: string;
  indexerUrl?: string;
  marketApiKey?: string;
  payApiKey?: string;
  baseApiUrl?: string;
  marketBaseUrl?: string;
  payBaseUrl?: string;
}

export interface ResolvedConfig extends StoredConfig {
  env: PeerEnv;
  format: OutputFormat;
  yes: boolean;
  debug: boolean;
  privateKey?: string;
}

export function getPeerConfigDir(): string {
  return join(homedir(), PEER_CONFIG_DIR);
}

export function getPeerConfigPath(): string {
  return join(getPeerConfigDir(), PEER_CONFIG_FILE);
}

export function getCheckoutCachePath(): string {
  return join(getPeerConfigDir(), PEER_CHECKOUT_CACHE_FILE);
}

export async function readStoredConfig(): Promise<StoredConfig> {
  try {
    const raw = await readFile(getPeerConfigPath(), 'utf8');
    return JSON.parse(raw) as StoredConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw createError('CONFIG_ERROR', 'Failed to read ~/.peer/config.json.', { details: error });
  }
}

export async function writeStoredConfig(patch: Partial<StoredConfig>): Promise<StoredConfig> {
  const next = { ...(await readStoredConfig()), ...patch };
  await replaceStoredConfig(next);
  return next;
}

export async function replaceStoredConfig(config: StoredConfig): Promise<void> {
  const configPath = getPeerConfigPath();
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  await chmod(dirname(configPath), 0o700);
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
  await chmod(configPath, 0o600);
}

export async function resolveConfig(globalOptions: GlobalOptions = {}): Promise<ResolvedConfig> {
  const stored = await readStoredConfig();
  logDebug('Loaded stored config', {
    hasPrivateKey: Boolean(stored.privateKey),
    hasWalletPath: Boolean(stored.walletPath),
    hasApiKey: Boolean(stored.apiKey),
    hasIndexerKey: Boolean(stored.indexerKey),
    hasMarketApiKey: Boolean(stored.marketApiKey),
    hasPayApiKey: Boolean(stored.payApiKey),
    env: stored.env,
  });
  const env = ensureOneOf(
    globalOptions.env ?? process.env.PEER_ENV ?? stored.env ?? 'production',
    'env',
    SUPPORTED_ENVS,
  );
  const format = ensureOneOf(globalOptions.format ?? 'json', 'format', SUPPORTED_FORMATS);

  const resolved = {
    env,
    format,
    yes: Boolean(globalOptions.yes),
    debug: Boolean(globalOptions.debug),
    privateKey: globalOptions.privateKey ?? process.env.PEER_PRIVATE_KEY ?? stored.privateKey,
    walletPath: globalOptions.walletPath ?? process.env.PEER_WALLET_PATH ?? stored.walletPath,
    rpcUrl: globalOptions.rpcUrl ?? process.env.PEER_RPC_URL ?? stored.rpcUrl ?? DEFAULT_RPC_URL,
    apiKey: globalOptions.apiKey ?? process.env.PEER_API_KEY ?? stored.apiKey,
    indexerKey: globalOptions.indexerKey ?? process.env.PEER_INDEXER_API_KEY ?? stored.indexerKey,
    indexerUrl: globalOptions.indexerUrl ?? process.env.PEER_INDEXER_URL ?? stored.indexerUrl,
    marketApiKey: globalOptions.marketApiKey ?? process.env.PEER_MARKET_API_KEY ?? stored.marketApiKey,
    payApiKey: globalOptions.payApiKey ?? process.env.PEER_PAY_API_KEY ?? stored.payApiKey,
    baseApiUrl:
      globalOptions.baseApiUrl ??
      process.env.PEER_BASE_API_URL ??
      stored.baseApiUrl ??
      DEFAULT_BASE_API_URLS[env],
    marketBaseUrl: ensureTrailingSlash(
      globalOptions.marketBaseUrl ?? process.env.PEER_MARKET_BASE_URL ?? stored.marketBaseUrl ?? DEFAULT_MARKET_API_URL,
    ),
    payBaseUrl: globalOptions.payBaseUrl ?? process.env.PEER_PAY_BASE_URL ?? stored.payBaseUrl ?? DEFAULT_PAY_API_URL,
  };
  logDebug('Resolved runtime config', {
    env: resolved.env,
    format: resolved.format,
    yes: resolved.yes,
    debug: resolved.debug,
    rpcUrl: resolved.rpcUrl,
    walletPath: resolved.walletPath,
    hasPrivateKey: Boolean(resolved.privateKey),
    hasApiKey: Boolean(resolved.apiKey),
    hasIndexerKey: Boolean(resolved.indexerKey),
    hasMarketApiKey: Boolean(resolved.marketApiKey),
    hasPayApiKey: Boolean(resolved.payApiKey),
  });
  return resolved;
}
