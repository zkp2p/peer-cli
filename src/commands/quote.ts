import { erc20Abi, zeroAddress } from 'viem';
import {
  amountToUnits,
  ensureAddress,
  ensureNumber,
  ensureSupportedCurrency,
  ensureSupportedPlatformList,
  ensureString,
  parseCsv,
} from '../utils/validation.js';
import { createError } from '../output/errors.js';
import type { CommandDefinition } from './framework.js';
import { sdkDirectWriteHandler, sdkReadHandler } from './helpers.js';
import { SUPPORTED_PLATFORMS } from '../utils/constants.js';
import { parseJsonArray } from '../utils/parsing.js';

const FIAT_AMOUNT_DECIMALS = 6;

function resolveDestinationToken(input: unknown, fallback: string | undefined): `0x${string}` {
  if (typeof input === 'string' && input.trim() !== '' && input.toUpperCase() !== 'USDC') {
    return ensureAddress(input, 'to');
  }
  if (fallback) {
    return ensureAddress(fallback, 'to');
  }
  throw createError('CONFIG_ERROR', 'USDC address is not available for the current runtime environment.');
}

async function readTokenDecimals(
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
  token: `0x${string}`,
): Promise<number> {
  const { publicClient } = await context.getClient({ requireWallet: false });
  return Number(
    await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  );
}

async function normalizeQuoteAmount(
  input: Record<string, unknown>,
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
  destinationToken: `0x${string}`,
): Promise<string> {
  if (input.tokenAmount !== undefined) {
    const decimals = await readTokenDecimals(context, destinationToken);
    return amountToUnits(input.tokenAmount, 'tokenAmount', decimals).toString();
  }

  return amountToUnits(input.amount, 'amount', FIAT_AMOUNT_DECIMALS).toString();
}

export const quoteDefinitions: CommandDefinition[] = [
  {
    path: ['quote'],
    description: 'Get fiat-to-USDC exchange quotes.',
    readOnly: true,
    options: [
      { name: 'from', flags: '--from <currency>', description: 'Fiat currency code.', schema: { type: 'string', description: 'Fiat currency code.' } },
      { name: 'to', flags: '--to <token>', description: 'Destination token symbol or address.', schema: { type: 'string', description: 'Destination token.' }, defaultValue: 'USDC' },
      { name: 'amount', flags: '--amount <value>', description: 'Amount to quote.', schema: { type: 'number', description: 'Fiat or token amount.' } },
      { name: 'tokenAmount', flags: '--token-amount <value>', description: 'Exact token amount to receive.', schema: { type: 'number', description: 'Exact token amount.' } },
      { name: 'platform', flags: '--platform <name>', description: 'Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platform.' } },
      { name: 'recipient', flags: '--recipient <address>', description: 'Destination wallet address.', schema: { type: 'string', description: 'Recipient address.' } },
      { name: 'user', flags: '--user <address>', description: 'Quote owner address.', schema: { type: 'string', description: 'User address.' } },
      { name: 'destinationChainId', flags: '--destination-chain-id <id>', description: 'Destination chain ID.', schema: { type: 'number', description: 'Destination chain.' }, defaultValue: 8453 },
      { name: 'quotesToReturn', flags: '--quotes-to-return <count>', description: 'Number of quotes to return.', schema: { type: 'number', description: 'Quote count.' }, defaultValue: 5 },
    ],
    handler: sdkReadHandler(['getQuote'], async (input, context) => {
      const { client, walletClient } = await context.getClient({ requireWallet: false });
      if (input.tokenAmount === undefined && input.amount === undefined) {
        throw createError('VALIDATION_ERROR', 'Either --amount or --token-amount is required.');
      }
      const destinationToken = resolveDestinationToken(input.to, client.getUsdcAddress());
      return [
        {
          paymentPlatforms: ensureSupportedPlatformList(parseCsv(input.platform as string | undefined) ?? [...SUPPORTED_PLATFORMS], 'platform')
            ?? [...SUPPORTED_PLATFORMS],
          fiatCurrency: ensureSupportedCurrency(input.from, 'from'),
          user: input.user ? ensureAddress(input.user, 'user') : walletClient.account?.address ?? zeroAddress,
          recipient: input.recipient ? ensureAddress(input.recipient, 'recipient') : walletClient.account?.address ?? zeroAddress,
          destinationChainId: ensureNumber(input.destinationChainId ?? 8453, 'destinationChainId'),
          destinationToken,
          quotesToReturn: ensureNumber(input.quotesToReturn ?? 5, 'quotesToReturn'),
          amount: await normalizeQuoteAmount(input, context, destinationToken),
          isExactFiat: input.tokenAmount === undefined,
        },
      ];
    }),
  },
  {
    path: ['payee', 'register'],
    description: 'Register payee details with the curator API.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'processors', flags: '--processors <names>', description: 'Comma-separated processor names.', schema: { type: 'string', description: 'Processor names.' } },
      { name: 'depositData', flags: '--deposit-data <json>', description: 'JSON array of deposit detail objects.', schema: { type: 'array', description: 'Deposit details array.' } },
    ],
    handler: sdkDirectWriteHandler(['registerPayeeDetails'], async (input) => [
      {
        processorNames: parseCsv(input.processors as string | undefined) ?? [],
        depositData: parseJsonArray(input.depositData, 'depositData'),
      },
    ]),
  },
  {
    path: ['payee', 'resolve-hash'],
    description: 'Resolve a payee hash from on-chain deposit data.',
    readOnly: true,
    args: [
      { name: 'depositId', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethodHash', description: 'Payment method hash.', schema: { type: 'string', description: 'Payment method hash.' } },
    ],
    handler: sdkReadHandler(['resolvePayeeHash'], async (input) => [
      BigInt(ensureString(input.depositId, 'depositId')),
      ensureString(input.paymentMethodHash, 'paymentMethodHash'),
    ]),
  },
];
