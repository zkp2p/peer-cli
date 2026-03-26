import { parseUnits } from 'viem';
import { createError } from '../output/errors.js';
import type { CommandDefinition } from './framework.js';
import { sdkReadHandler, sdkWriteHandler } from './helpers.js';
import { ensureAddress, ensureNumber, ensurePositiveNumber, ensureString, parseJsonInput } from '../utils/validation.js';

function asBigInt(value: unknown, field: string): bigint {
  return BigInt(ensureString(value, field));
}

function parseJsonObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    return parseJsonInput(value, field) ?? {};
  }
  throw createError('VALIDATION_ERROR', `${field} must be a JSON object.`);
}

function parseJsonArray(value: unknown, field: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return JSON.parse(value) as unknown[];
  }
  throw createError('VALIDATION_ERROR', `${field} must be a JSON array.`);
}

function parseConversionRate(value: unknown): string {
  return parseUnits(ensurePositiveNumber(value, 'conversionRate').toString(), 18).toString();
}

export const intentDefinitions: CommandDefinition[] = [
  {
    path: ['intent', 'create'],
    description: 'Signal a taker intent.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'deposit', flags: '--deposit <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'amount', flags: '--amount <value>', description: 'USDC amount.', schema: { type: 'number', description: 'USDC amount.' } },
      { name: 'platform', flags: '--platform <name>', description: 'Processor name.', schema: { type: 'string', description: 'Processor name.' } },
      { name: 'currency', flags: '--currency <code>', description: 'Fiat currency code.', schema: { type: 'string', description: 'Fiat currency.' } },
      { name: 'to', flags: '--to <address>', description: 'Recipient address.', schema: { type: 'string', description: 'Recipient address.' } },
      { name: 'rate', flags: '--rate <value>', description: 'Conversion rate as human decimal.', schema: { type: 'number', description: 'Conversion rate.' } },
      { name: 'payeeDetails', flags: '--payee-details <value>', description: 'Payee details string or serialized data.', schema: { type: 'string', description: 'Payee details.' } },
      { name: 'processorIntentData', flags: '--processor-intent-data <json>', description: 'JSON processor intent data.', schema: { type: 'object', description: 'Processor intent data.' } },
    ],
    handler: sdkWriteHandler(['signalIntent'], async (input) => ({
      depositId: asBigInt(input.deposit, 'deposit'),
      amount: parseUnits(ensurePositiveNumber(input.amount, 'amount').toString(), 6),
      toAddress: ensureAddress(input.to, 'to'),
      processorName: ensureString(input.platform, 'platform'),
      payeeDetails: ensureString(input.payeeDetails, 'payeeDetails'),
      fiatCurrencyCode: ensureString(input.currency, 'currency'),
      conversionRate: parseConversionRate(input.rate),
      processorIntentData: input.processorIntentData ? parseJsonObject(input.processorIntentData, 'processorIntentData') : undefined,
    })),
  },
  {
    path: ['intent', 'list'],
    description: 'List intents for the configured wallet or explicit owner.',
    readOnly: true,
    options: [{ name: 'owner', flags: '--owner <address>', description: 'Owner address.', schema: { type: 'string', description: 'Owner address.' } }],
    handler: async (input, context) => {
      const { client, walletClient } = await context.getClient({ requireWallet: false });
      const owner = input.owner ? ensureAddress(input.owner, 'owner') : walletClient.account?.address;
      return owner ? client.getAccountIntents(owner) : client.getIntents();
    },
  },
  {
    path: ['intent', 'show'],
    description: 'Show a single intent by hash.',
    readOnly: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkReadHandler(['getIntent'], async (input) => [ensureString(input.intentHash, 'intentHash')]),
  },
  {
    path: ['intent', 'cancel'],
    description: 'Cancel an intent.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'hash', flags: '--hash <intentHash>', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkWriteHandler(['cancelIntent'], async (input) => ({ intentHash: ensureString(input.hash, 'hash') })),
  },
  {
    path: ['intent', 'fulfill'],
    description: 'Fulfill an intent with a proof or precomputed attestation.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'hash', flags: '--hash <intentHash>', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } },
      { name: 'proof', flags: '--proof <json>', description: 'Proof JSON object.', schema: { type: 'object', description: 'Proof JSON.' } },
      { name: 'precomputedAttestation', flags: '--precomputed-attestation <json>', description: 'Precomputed attestation JSON object.', schema: { type: 'object', description: 'Precomputed attestation.' } },
    ],
    handler: sdkWriteHandler(['fulfillIntent'], async (input) => ({
      intentHash: ensureString(input.hash, 'hash'),
      ...(input.proof ? parseJsonObject(input.proof, 'proof') : {}),
      ...(input.precomputedAttestation ? { precomputedAttestation: parseJsonObject(input.precomputedAttestation, 'precomputedAttestation') } : {}),
    })),
  },
  {
    path: ['intent', 'release'],
    description: 'Release funds back to the payer.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'hash', flags: '--hash <intentHash>', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkWriteHandler(['releaseFundsToPayer'], async (input) => ({ intentHash: ensureString(input.hash, 'hash') })),
  },
  {
    path: ['intent', 'fulfill-inputs'],
    description: 'Inspect fulfill routing inputs for an intent.',
    readOnly: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkReadHandler(['getFulfillIntentInputs'], async (input) => [ensureString(input.intentHash, 'intentHash')]),
  },
  {
    path: ['intent', 'cleanup-orphaned'],
    description: 'Clean up orphaned intents in batch.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'hashes', flags: '--hashes <json>', description: 'JSON array of intent hashes.', schema: { type: 'array', description: 'Intent hashes.' } }],
    handler: sdkWriteHandler(['cleanupOrphanedIntents'], async (input) => ({ intentHashes: parseJsonArray(input.hashes, 'hashes') })),
  },
  {
    path: ['intent-hook', 'pre', 'set'],
    description: 'Set the pre-intent hook for a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'hook', flags: '--hook <address>', description: 'Hook contract address.', schema: { type: 'string', description: 'Hook address.' } },
    ],
    handler: sdkWriteHandler(['setDepositPreIntentHook'], async (input) => ({ depositId: asBigInt(input.id, 'id'), preIntentHook: ensureAddress(input.hook, 'hook') })),
  },
  {
    path: ['intent-hook', 'whitelist', 'set'],
    description: 'Set the whitelist hook for a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'hook', flags: '--hook <address>', description: 'Hook contract address.', schema: { type: 'string', description: 'Hook address.' } },
    ],
    handler: sdkWriteHandler(['setDepositWhitelistHook'], async (input) => ({ depositId: asBigInt(input.id, 'id'), whitelistHook: ensureAddress(input.hook, 'hook') })),
  },
  {
    path: ['intent-hook', 'pre', 'get'],
    description: 'Get the pre-intent hook for a deposit.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkReadHandler(['getDepositPreIntentHook'], async (input) => [asBigInt(input.depositId, 'depositId')]),
  },
  {
    path: ['intent-hook', 'whitelist', 'get'],
    description: 'Get the whitelist hook for a deposit.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkReadHandler(['getDepositWhitelistHook'], async (input) => [asBigInt(input.depositId, 'depositId')]),
  },
  {
    path: ['pv', 'intent', 'list-owner'],
    description: 'Fetch intents for an owner directly from ProtocolViewer.',
    readOnly: true,
    options: [{ name: 'owner', flags: '--owner <address>', description: 'Owner address.', schema: { type: 'string', description: 'Owner address.' } }],
    handler: sdkReadHandler(['getPvAccountIntents'], async (input) => [ensureAddress(input.owner, 'owner')]),
  },
  {
    path: ['pv', 'intent', 'show'],
    description: 'Fetch a single intent directly from ProtocolViewer.',
    readOnly: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkReadHandler(['getPvIntent'], async (input) => [ensureString(input.intentHash, 'intentHash')]),
  },
  {
    path: ['indexer', 'intents', 'by-deposit-ids'],
    description: 'Fetch intents for multiple deposits via the indexer.',
    readOnly: true,
    options: [
      { name: 'depositIds', flags: '--deposit-ids <json>', description: 'JSON array of composite deposit IDs.', schema: { type: 'array', description: 'Deposit IDs.' } },
      { name: 'statuses', flags: '--statuses <json>', description: 'JSON array of statuses.', schema: { type: 'array', description: 'Intent statuses.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getIntentsForDeposits'], async (input) => [parseJsonArray(input.depositIds, 'depositIds'), input.statuses ? parseJsonArray(input.statuses, 'statuses') : undefined]),
  },
  {
    path: ['indexer', 'intents', 'by-owner'],
    description: 'Fetch intents by owner via the indexer.',
    readOnly: true,
    args: [{ name: 'owner', description: 'Owner address.', schema: { type: 'string', description: 'Owner address.' } }],
    options: [{ name: 'statuses', flags: '--statuses <json>', description: 'JSON array of statuses.', schema: { type: 'array', description: 'Intent statuses.' } }],
    handler: sdkReadHandler(['indexer', 'getOwnerIntents'], async (input) => [ensureAddress(input.owner, 'owner'), input.statuses ? parseJsonArray(input.statuses, 'statuses') : undefined]),
  },
  {
    path: ['indexer', 'intents', 'show'],
    description: 'Fetch a single intent via the indexer.',
    readOnly: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkReadHandler(['indexer', 'getIntentByHash'], async (input) => [ensureString(input.intentHash, 'intentHash')]),
  },
  {
    path: ['indexer', 'intents', 'expired'],
    description: 'Fetch expired intents via the indexer.',
    readOnly: true,
    options: [
      { name: 'now', flags: '--now <value>', description: 'Current timestamp or bigint string.', schema: { type: 'string', description: 'Current time.' } },
      { name: 'depositIds', flags: '--deposit-ids <json>', description: 'JSON array of composite deposit IDs.', schema: { type: 'array', description: 'Deposit IDs.' } },
      { name: 'limit', flags: '--limit <count>', description: 'Maximum result size.', schema: { type: 'number', description: 'Result limit.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getExpiredIntents'], async (input) => [{ now: ensureString(input.now, 'now'), depositIds: parseJsonArray(input.depositIds, 'depositIds'), limit: input.limit ? ensureNumber(input.limit, 'limit') : undefined }]),
  },
  {
    path: ['indexer', 'intents', 'fulfilled-events'],
    description: 'Fetch fulfillment events for intents.',
    readOnly: true,
    options: [{ name: 'hashes', flags: '--hashes <json>', description: 'JSON array of intent hashes.', schema: { type: 'array', description: 'Intent hashes.' } }],
    handler: sdkReadHandler(['indexer', 'getFulfilledIntentEvents'], async (input) => [parseJsonArray(input.hashes, 'hashes')]),
  },
  {
    path: ['indexer', 'intents', 'fulfillment-amounts'],
    description: 'Fetch fulfillment amounts for an intent.',
    readOnly: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkReadHandler(['indexer', 'getIntentFulfillmentAmounts'], async (input) => [ensureString(input.intentHash, 'intentHash')]),
  },
  {
    path: ['indexer', 'intents', 'fulfillment-and-payment'],
    description: 'Fetch fulfillment and payment records for an intent.',
    readOnly: true,
    args: [{ name: 'intentHash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } }],
    handler: sdkReadHandler(['indexer', 'getFulfillmentAndPayment'], async (input) => [ensureString(input.intentHash, 'intentHash')]),
  },
];
