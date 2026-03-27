import { formatUnits, parseUnits } from 'viem';
import type { MulticallClient } from '@zkp2p/sdk';
import type { CommandDefinition } from './framework.js';
import { sdkReadHandler, sdkWriteHandler } from './helpers.js';
import { ensureAddress, ensureNumber, ensurePositiveNumber, ensureString } from '../utils/validation.js';
import { asBigInt, parseJsonArray, parseJsonObject } from '../utils/parsing.js';
import type { PeerEnv } from '../sdk/config.js';
import { createError } from '../output/errors.js';

function parseRate(value: unknown): bigint {
  return parseUnits(ensurePositiveNumber(value, 'rate').toString(), 18);
}

function parseFeePercent(value: unknown): bigint {
  return parseUnits((ensurePositiveNumber(value, 'fee') / 100).toString(), 18);
}

async function maybeResolvePaymentMethod(input: string, env: PeerEnv): Promise<`0x${string}`> {
  if (input.startsWith('0x')) {
    return input as `0x${string}`;
  }
  const { resolvePaymentMethodHash } = await import('@zkp2p/sdk');
  return resolvePaymentMethodHash(input, { env });
}

async function maybeResolveCurrency(input: string): Promise<`0x${string}`> {
  if (input.startsWith('0x')) {
    return input as `0x${string}`;
  }
  const { resolveFiatCurrencyBytes32 } = await import('@zkp2p/sdk');
  return resolveFiatCurrencyBytes32(input);
}

interface VaultManagerEntry {
  manager: Record<string, unknown>;
  aggregate: Record<string, unknown>;
}

function flattenVaultEntry(entry: VaultManagerEntry): Record<string, unknown> {
  const mgr = entry.manager;
  const agg = entry.aggregate;
  const fee = typeof mgr.fee === 'string' ? Number(formatUnits(BigInt(mgr.fee), 18)) * 100 : undefined;
  const maxFee = typeof mgr.maxFee === 'string' ? Number(formatUnits(BigInt(mgr.maxFee), 18)) * 100 : undefined;
  const volume = typeof agg.totalFilledVolume === 'string' ? Number(agg.totalFilledVolume) / 1e6 : undefined;
  const pnl = typeof agg.totalPnlUsdCents === 'string' ? Number(agg.totalPnlUsdCents) / 100 : undefined;
  const delegatedBalance = typeof agg.currentDelegatedBalance === 'string' ? Number(agg.currentDelegatedBalance) / 1e6 : undefined;
  return {
    name: mgr.name,
    rateManagerId: mgr.rateManagerId,
    manager: mgr.manager,
    feePercent: fee !== undefined ? `${fee.toFixed(2)}%` : undefined,
    maxFeePercent: maxFee !== undefined ? `${maxFee.toFixed(2)}%` : undefined,
    feeRecipient: mgr.feeRecipient,
    delegatedDeposits: agg.currentDelegatedDeposits,
    delegatedBalanceUsdc: delegatedBalance,
    volumeUsdc: volume,
    pnlUsd: pnl,
    fulfilledIntents: agg.fulfilledIntents,
    uri: mgr.uri || undefined,
    createdAt: mgr.createdAt,
  };
}

export const vaultDefinitions: CommandDefinition[] = [
  {
    path: ['vault', 'create'],
    description: 'Create a new rate manager vault.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'manager', flags: '--manager <address>', description: 'Vault manager address.', schema: { type: 'string', description: 'Manager address.' } },
      { name: 'feeRecipient', flags: '--fee-recipient <address>', description: 'Fee recipient address.', schema: { type: 'string', description: 'Fee recipient.' } },
      { name: 'fee', flags: '--fee <percent>', description: 'Current fee percentage.', schema: { type: 'number', description: 'Fee percentage.' } },
      { name: 'maxFee', flags: '--max-fee <percent>', description: 'Maximum fee percentage.', schema: { type: 'number', description: 'Max fee percentage.' }, defaultValue: 5 },
      { name: 'name', flags: '--name <value>', description: 'Vault display name.', schema: { type: 'string', description: 'Vault name.' } },
      { name: 'uri', flags: '--uri <value>', description: 'Vault metadata URI.', schema: { type: 'string', description: 'Vault URI.' }, defaultValue: '' },
      { name: 'depositHook', flags: '--deposit-hook <address>', description: 'Optional deposit hook address.', schema: { type: 'string', description: 'Deposit hook.' } },
      { name: 'minLiquidity', flags: '--min-liquidity <value>', description: 'Optional minimum liquidity in USDC.', schema: { type: 'number', description: 'Minimum liquidity.' } },
    ],
    handler: sdkWriteHandler(['createRateManager'], async (input) => ({
      config: {
        manager: ensureAddress(input.manager, 'manager'),
        feeRecipient: ensureAddress(input.feeRecipient, 'feeRecipient'),
        maxFee: parseFeePercent(input.maxFee ?? 5),
        fee: parseFeePercent(input.fee),
        depositHook: input.depositHook ? ensureAddress(input.depositHook, 'depositHook') : undefined,
        minLiquidity: input.minLiquidity ? parseUnits(ensurePositiveNumber(input.minLiquidity, 'minLiquidity').toString(), 6) : undefined,
        name: ensureString(input.name, 'name'),
        uri: ensureString(input.uri ?? '', 'uri'),
      },
    })),
  },
  {
    path: ['vault', 'list'],
    description: 'List vaults via the indexer.',
    readOnly: true,
    options: [
      { name: 'manager', flags: '--manager <address>', description: 'Filter by manager address.', schema: { type: 'string', description: 'Manager address.' } },
      { name: 'limit', flags: '--limit <value>', description: 'Maximum vaults to return.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
      { name: 'pagination', flags: '--pagination <json>', description: 'Raw JSON pagination object (advanced).', schema: { type: 'object', description: 'Pagination options.' } },
      { name: 'filter', flags: '--filter <json>', description: 'Raw JSON filter object (advanced).', schema: { type: 'object', description: 'Filter options.' } },
    ],
    handler: async (input, context) => {
      const { client } = await context.getClient({ requireWallet: false });
      const pagination = input.pagination
        ? parseJsonObject(input.pagination, 'pagination')
        : { limit: ensureNumber(input.limit ?? 50, 'limit'), offset: ensureNumber(input.offset ?? 0, 'offset') };
      const filter = input.filter
        ? parseJsonObject(input.filter, 'filter')
        : input.manager
          ? { manager: ensureAddress(input.manager, 'manager') }
          : undefined;
      const results = await client.indexer.getRateManagers(pagination, filter) as unknown as VaultManagerEntry[];
      return results.map(flattenVaultEntry);
    },
  },
  {
    path: ['vault', 'show'],
    description: 'Show vault details by rateManagerId.',
    readOnly: true,
    args: [{ name: 'rateManagerId', description: 'Vault rateManagerId (bytes32 hash).', schema: { type: 'string', description: 'Vault identifier.' } }],
    handler: async (input, context) => {
      const id = ensureString(input.rateManagerId, 'rateManagerId');
      const { client } = await context.getClient({ requireWallet: false });

      // Try the detail endpoint first
      const detail = await client.indexer.getRateManagerDetail(id);
      if (detail) return detail;

      // Fall back to filtering from the list (the detail endpoint has known SDK issues)
      const allVaults = await client.indexer.getRateManagers() as unknown as VaultManagerEntry[];
      const match = allVaults.find((v) =>
        (v.manager as { rateManagerId?: string }).rateManagerId?.toLowerCase() === id.toLowerCase(),
      );
      if (!match) {
        throw createError('VALIDATION_ERROR', `Vault not found: ${id}`, {
          suggestion: 'Run peer vault list to see available vault IDs.',
        });
      }
      return flattenVaultEntry(match);
    },
  },
  {
    path: ['vault', 'set-rate'],
    description: 'Set a minimum rate for one payment method/currency pair.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <rateManagerId>', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } },
      { name: 'platform', flags: '--platform <value>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Fiat currency code or hash.', schema: { type: 'string', description: 'Currency.' } },
      { name: 'rate', flags: '--rate <value>', description: 'Human-readable conversion rate.', schema: { type: 'number', description: 'Conversion rate.' } },
    ],
    handler: sdkWriteHandler(['setVaultMinRate'], async (input, context) => ({
      rateManagerId: ensureString(input.id, 'id'),
      paymentMethodHash: await maybeResolvePaymentMethod(ensureString(input.platform, 'platform'), context.config.env),
      currencyHash: await maybeResolveCurrency(ensureString(input.currency, 'currency')),
      rate: parseRate(input.rate),
    })),
  },
  {
    path: ['vault', 'set-rates'],
    description: 'Set rates in batch.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <rateManagerId>', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } },
      { name: 'paymentMethods', flags: '--payment-methods <json>', description: 'JSON array of payment method hashes.', schema: { type: 'array', description: 'Payment method hashes.' } },
      { name: 'currencies', flags: '--currencies <json>', description: 'JSON matrix of currency hashes.', schema: { type: 'array', description: 'Currency hash matrix.' } },
      { name: 'rates', flags: '--rates <json>', description: 'JSON matrix of 18-decimal bigint strings or numbers.', schema: { type: 'array', description: 'Rate matrix.' } },
    ],
    handler: sdkWriteHandler(['setVaultMinRatesBatch'], async (input) => ({
      rateManagerId: ensureString(input.id, 'id'),
      paymentMethods: parseJsonArray(input.paymentMethods, 'paymentMethods'),
      currencies: parseJsonArray(input.currencies, 'currencies'),
      rates: parseJsonArray(input.rates, 'rates'),
    })),
  },
  {
    path: ['vault', 'set-fee'],
    description: 'Update the vault fee percentage.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <rateManagerId>', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } },
      { name: 'fee', flags: '--fee <percent>', description: 'New fee percentage.', schema: { type: 'number', description: 'Fee percentage.' } },
    ],
    handler: sdkWriteHandler(['setVaultFee'], async (input) => ({ rateManagerId: ensureString(input.id, 'id'), newFee: parseFeePercent(input.fee) })),
  },
  {
    path: ['vault', 'set-config'],
    description: 'Update vault metadata and manager addresses.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <rateManagerId>', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } },
      { name: 'manager', flags: '--manager <address>', description: 'New manager address.', schema: { type: 'string', description: 'Manager address.' } },
      { name: 'feeRecipient', flags: '--fee-recipient <address>', description: 'New fee recipient address.', schema: { type: 'string', description: 'Fee recipient.' } },
      { name: 'hook', flags: '--hook <address>', description: 'Optional new hook address.', schema: { type: 'string', description: 'Hook address.' } },
      { name: 'name', flags: '--name <value>', description: 'New vault name.', schema: { type: 'string', description: 'Vault name.' } },
      { name: 'uri', flags: '--uri <value>', description: 'New vault URI.', schema: { type: 'string', description: 'Vault URI.' } },
    ],
    handler: sdkWriteHandler(['setVaultConfig'], async (input) => ({
      rateManagerId: ensureString(input.id, 'id'),
      newManager: ensureAddress(input.manager, 'manager'),
      newFeeRecipient: ensureAddress(input.feeRecipient, 'feeRecipient'),
      newHook: input.hook ? ensureAddress(input.hook, 'hook') : undefined,
      newName: ensureString(input.name, 'name'),
      newUri: ensureString(input.uri, 'uri'),
    })),
  },
  {
    path: ['vault', 'delegates'],
    description: 'List delegated deposits for a vault.',
    readOnly: true,
    args: [{ name: 'rateManagerId', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } }],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum delegations.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
      { name: 'pagination', flags: '--pagination <json>', description: 'Raw JSON pagination object (advanced).', schema: { type: 'object', description: 'Pagination options.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getRateManagerDelegations'], async (input) => {
      const pagination = input.pagination
        ? parseJsonObject(input.pagination, 'pagination')
        : { limit: ensureNumber(input.limit ?? 50, 'limit'), offset: ensureNumber(input.offset ?? 0, 'offset') };
      return [ensureString(input.rateManagerId, 'rateManagerId'), pagination];
    }),
  },
  {
    path: ['vault', 'snapshots'],
    description: 'Fetch daily snapshots for a vault.',
    readOnly: true,
    args: [{ name: 'rateManagerId', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } }],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum snapshots.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 30 },
      { name: 'options', flags: '--options <json>', description: 'Raw JSON snapshot options (advanced).', schema: { type: 'object', description: 'Snapshot options.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getManagerDailySnapshots'], async (input) => {
      const options = input.options
        ? parseJsonObject(input.options, 'options')
        : { limit: ensureNumber(input.limit ?? 30, 'limit') };
      return [ensureString(input.rateManagerId, 'rateManagerId'), options];
    }),
  },
  {
    path: ['vault', 'manual-rate-updates'],
    description: 'Fetch manual rate updates for a vault.',
    readOnly: true,
    args: [{ name: 'rateManagerId', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } }],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum entries.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'options', flags: '--options <json>', description: 'Raw JSON query options (advanced).', schema: { type: 'object', description: 'Query options.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getManualRateUpdates'], async (input) => {
      const options = input.options
        ? parseJsonObject(input.options, 'options')
        : { limit: ensureNumber(input.limit ?? 50, 'limit') };
      return [ensureString(input.rateManagerId, 'rateManagerId'), options];
    }),
  },
  {
    path: ['vault', 'oracle-config-updates'],
    description: 'Fetch oracle config updates for a vault.',
    readOnly: true,
    args: [{ name: 'rateManagerId', description: 'Vault rateManagerId.', schema: { type: 'string', description: 'Vault identifier.' } }],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum entries.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'options', flags: '--options <json>', description: 'Raw JSON query options (advanced).', schema: { type: 'object', description: 'Query options.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getOracleConfigUpdates'], async (input) => {
      const options = input.options
        ? parseJsonObject(input.options, 'options')
        : { limit: ensureNumber(input.limit ?? 50, 'limit') };
      return [ensureString(input.rateManagerId, 'rateManagerId'), options];
    }),
  },
  {
    path: ['vault', 'manager-fee'],
    description: 'Read the effective manager fee for a delegated deposit.',
    readOnly: true,
    options: [
      { name: 'escrow', flags: '--escrow <address>', description: 'Escrow address.', schema: { type: 'string', description: 'Escrow address.' } },
      { name: 'depositId', flags: '--deposit-id <value>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
    ],
    handler: sdkReadHandler(['getManagerFee'], async (input) => [ensureAddress(input.escrow, 'escrow'), asBigInt(input.depositId, 'depositId')]),
  },
  {
    path: ['vault', 'effective-rate'],
    description: 'Read the effective rate for a delegated deposit pair.',
    readOnly: true,
    options: [
      { name: 'escrow', flags: '--escrow <address>', description: 'Escrow address.', schema: { type: 'string', description: 'Escrow address.' } },
      { name: 'depositId', flags: '--deposit-id <value>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'platform', flags: '--platform <value>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Fiat currency code or hash.', schema: { type: 'string', description: 'Fiat currency.' } },
    ],
    handler: sdkReadHandler(['getEffectiveRate'], async (input, context) => [{
      escrow: ensureAddress(input.escrow, 'escrow'),
      depositId: asBigInt(input.depositId, 'depositId'),
      paymentMethod: await maybeResolvePaymentMethod(ensureString(input.platform, 'platform'), context.config.env),
      fiatCurrency: await maybeResolveCurrency(ensureString(input.currency, 'currency')),
    }]),
  },
  {
    path: ['oracle', 'supports-inline'],
    description: 'Check whether the current escrow deployment supports inline oracle configs.',
    readOnly: true,
    options: [{ name: 'escrowAddress', flags: '--escrow-address <address>', description: 'Optional escrow address override.', schema: { type: 'string', description: 'Escrow address.' } }],
    handler: async (input, context) => {
      const { client } = await context.getClient({ requireWallet: false });
      return client.supportsInlineOracleRateConfig(
        input.escrowAddress ? { escrowAddress: ensureAddress(input.escrowAddress, 'escrowAddress') } : undefined,
      );
    },
  },
  {
    path: ['oracle', 'validate-feeds'],
    description: 'Validate bundled oracle feeds on-chain.',
    readOnly: true,
    handler: async (_input, context) => {
      const { validateOracleFeedsOnChain } = await import('@zkp2p/sdk');
      const { publicClient } = await context.getClient({ requireWallet: false });
      const result = await validateOracleFeedsOnChain(publicClient as unknown as MulticallClient);
      return [...result];
    },
  },
];
