import { privateKeyToAccount } from 'viem/accounts';
import type { CommandDefinition } from './framework.js';
import { readStoredConfig, writeStoredConfig } from '../sdk/config.js';
import { SUPPORTED_CURRENCIES, SUPPORTED_ENVS, SUPPORTED_PLATFORMS } from '../utils/constants.js';
import { ensureHexPrivateKey, ensureOneOf, ensureString } from '../utils/validation.js';

const CONFIG_KEYS = ['env', 'wallet', 'walletPath', 'api-key', 'apiKey', 'market-api-key', 'marketApiKey', 'pay-api-key', 'payApiKey', 'rpc-url', 'rpcUrl', 'indexer-url', 'indexerUrl', 'indexer-key', 'indexerKey'] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

const SECRET_CONFIG_KEYS = ['privateKey', 'apiKey', 'indexerKey', 'marketApiKey', 'payApiKey'] as const;

function maskPrivateKey(value: string): string {
  return value.length > 9 ? `${value.slice(0, 6)}...${value.slice(-3)}` : '[REDACTED]';
}

function maskApiKey(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}...` : '[REDACTED]';
}

function sanitizeConfigShape<T extends object>(value: T): T & { walletAddress?: string } {
  const sanitized = { ...(value as Record<string, unknown>) };

  for (const key of SECRET_CONFIG_KEYS) {
    const secret = sanitized[key];
    if (typeof secret === 'string' && secret.length > 0) {
      sanitized[key] = key === 'privateKey' ? maskPrivateKey(secret) : maskApiKey(secret);
    }
  }

  const rawPrivateKey = (value as { privateKey?: unknown }).privateKey;
  if (typeof rawPrivateKey === 'string' && rawPrivateKey.length > 0) {
    sanitized.walletAddress = privateKeyToAccount(ensureHexPrivateKey(rawPrivateKey)).address;
  }

  return sanitized as T & { walletAddress?: string };
}

function normalizeConfigKey(value: string): ConfigKey {
  const aliases: Record<string, ConfigKey> = {
    env: 'env',
    wallet: 'walletPath',
    walletPath: 'walletPath',
    'api-key': 'apiKey',
    apiKey: 'apiKey',
    'market-api-key': 'marketApiKey',
    marketApiKey: 'marketApiKey',
    'pay-api-key': 'payApiKey',
    payApiKey: 'payApiKey',
    'rpc-url': 'rpcUrl',
    rpcUrl: 'rpcUrl',
    'indexer-url': 'indexerUrl',
    indexerUrl: 'indexerUrl',
    'indexer-key': 'indexerKey',
    indexerKey: 'indexerKey',
  };

  return aliases[value] ?? ensureOneOf(value, 'key', CONFIG_KEYS);
}

export const configDefinitions: CommandDefinition[] = [
  {
    path: ['config', 'show'],
    description: 'Show the stored Peer CLI config merged with current global flags.',
    readOnly: true,
    handler: async (_input, context) => ({
      stored: sanitizeConfigShape(await readStoredConfig()),
      resolved: sanitizeConfigShape(context.config),
    }),
  },
  {
    path: ['config', 'set'],
    description: 'Persist a config value to ~/.peer/config.json.',
    readOnly: false,
    args: [
      { name: 'key', description: 'Config key to update.', schema: { type: 'string', description: 'Config key.' } },
      { name: 'value', description: 'New config value.', schema: { type: 'string', description: 'Config value.' } },
    ],
    handler: async (input) => {
      const key = normalizeConfigKey(ensureString(input.key, 'key'));
      const value = ensureString(input.value, 'value');

      if (key === 'env') {
        return writeStoredConfig({ env: ensureOneOf(value, 'value', SUPPORTED_ENVS) });
      }

      return writeStoredConfig({ [key]: value });
    },
  },
  {
    path: ['config', 'platforms'],
    description: 'List supported payment platforms.',
    readOnly: true,
    handler: async () => [...SUPPORTED_PLATFORMS],
  },
  {
    path: ['config', 'currencies'],
    description: 'List supported fiat currencies.',
    readOnly: true,
    handler: async () => [...SUPPORTED_CURRENCIES],
  },
];
