import type { CommandDefinition } from './framework.js';
import { sdkReadHandler, sdkWriteHandler } from './helpers.js';
import { ensureAddress, ensureString } from '../utils/validation.js';
import { DEFAULT_CHAIN_ID } from '../utils/constants.js';

function asBigInt(value: unknown, field: string): bigint {
  return BigInt(ensureString(value, field));
}

async function getDefaultEscrow(context: Parameters<NonNullable<CommandDefinition['handler']>>[1]): Promise<`0x${string}`> {
  const { client } = await context.getClient({ requireWallet: false });
  const deployed = client.getDeployedAddresses();
  return (deployed.escrowV2 ?? deployed.escrow) as `0x${string}`;
}

async function getDefaultRegistry(env: 'production' | 'staging'): Promise<`0x${string}`> {
  const { getRateManagerContracts } = await import('@zkp2p/sdk');
  return getRateManagerContracts(DEFAULT_CHAIN_ID, env).addresses.registry;
}

export const delegateDefinitions: CommandDefinition[] = [
  {
    path: ['delegate', 'set'],
    description: 'Delegate a deposit to a vault via the controller flow.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'deposit', flags: '--deposit <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'vault', flags: '--vault <rateManagerId>', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } },
      { name: 'escrow', flags: '--escrow <address>', description: 'Escrow address override.', schema: { type: 'string', description: 'Escrow address.' } },
      { name: 'registry', flags: '--registry <address>', description: 'Registry address override.', schema: { type: 'string', description: 'Registry address.' } },
    ],
    handler: sdkWriteHandler(['setDepositRateManager'], async (input, context) => ({
      escrow: input.escrow ? ensureAddress(input.escrow, 'escrow') : await getDefaultEscrow(context),
      depositId: asBigInt(input.deposit, 'deposit'),
      registry: input.registry ? ensureAddress(input.registry, 'registry') : await getDefaultRegistry(context.config.env),
      rateManagerId: ensureString(input.vault, 'vault'),
    })),
  },
  {
    path: ['undelegate'],
    description: 'Remove controller-based vault delegation from a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'deposit', flags: '--deposit <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'escrow', flags: '--escrow <address>', description: 'Escrow address override.', schema: { type: 'string', description: 'Escrow address.' } },
    ],
    handler: sdkWriteHandler(['clearDepositRateManager'], async (input, context) => ({
      escrow: input.escrow ? ensureAddress(input.escrow, 'escrow') : await getDefaultEscrow(context),
      depositId: asBigInt(input.deposit, 'deposit'),
    })),
  },
  {
    path: ['delegate', 'show'],
    description: 'Show current controller-based delegation for a deposit.',
    readOnly: true,
    options: [
      { name: 'deposit', flags: '--deposit <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'escrow', flags: '--escrow <address>', description: 'Escrow address override.', schema: { type: 'string', description: 'Escrow address.' } },
    ],
    handler: sdkReadHandler(['getDepositRateManager'], async (input, context) => [input.escrow ? ensureAddress(input.escrow, 'escrow') : await getDefaultEscrow(context), asBigInt(input.deposit, 'deposit')]),
  },
  {
    path: ['delegate', 'set-direct'],
    description: 'Delegate a deposit directly on EscrowV2 without the controller helper.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'deposit', flags: '--deposit <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'rateManagerAddress', flags: '--rate-manager-address <address>', description: 'Rate manager contract address.', schema: { type: 'string', description: 'Rate manager address.' } },
      { name: 'vault', flags: '--vault <rateManagerId>', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } },
    ],
    handler: sdkWriteHandler(['setRateManager'], async (input) => ({
      depositId: asBigInt(input.deposit, 'deposit'),
      rateManagerAddress: ensureAddress(input.rateManagerAddress, 'rateManagerAddress'),
      rateManagerId: ensureString(input.vault, 'vault'),
    })),
  },
  {
    path: ['delegate', 'clear-direct'],
    description: 'Clear direct EscrowV2 delegation from a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'deposit', flags: '--deposit <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkWriteHandler(['clearRateManager'], async (input) => ({ depositId: asBigInt(input.deposit, 'deposit') })),
  },
  {
    path: ['indexer', 'delegations', 'by-deposit'],
    description: 'Fetch the delegation record for a composite deposit ID via the indexer.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Composite deposit ID.', schema: { type: 'string', description: 'Composite deposit ID.' } }],
    options: [{ name: 'options', flags: '--options <json>', description: 'JSON options object.', schema: { type: 'object', description: 'Delegation query options.' } }],
    handler: sdkReadHandler(['indexer', 'getDelegationForDeposit'], async (input) => [ensureString(input.depositId, 'depositId'), input.options ? JSON.parse(ensureString(input.options, 'options')) : undefined]),
  },
];
