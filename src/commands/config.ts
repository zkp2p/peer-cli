import type { CommandDefinition } from './framework.js';
import { readStoredConfig, writeStoredConfig } from '../sdk/config.js';
import { SUPPORTED_CURRENCIES, SUPPORTED_ENVS, SUPPORTED_PLATFORMS } from '../utils/constants.js';
import { ensureOneOf, ensureString } from '../utils/validation.js';

const CONFIG_KEYS = ['env', 'wallet', 'walletPath', 'api-key', 'apiKey', 'market-api-key', 'marketApiKey', 'pay-api-key', 'payApiKey', 'rpc-url', 'rpcUrl', 'indexer-url', 'indexerUrl', 'indexer-key', 'indexerKey'] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

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
      stored: await readStoredConfig(),
      resolved: context.config,
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
