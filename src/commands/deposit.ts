import { encodeFunctionData, erc20Abi, formatUnits, keccak256, parseUnits, stringToHex } from 'viem';
import { createError } from '../output/errors.js';
import type { CommandDefinition } from './framework.js';
import { sdkReadHandler, sdkSeparatePrepareHandler, sdkWriteHandler } from './helpers.js';
import { parsePayeeDepositData, parseProcessorNames } from './payee-data.js';
import {
  ensureAddress,
  ensureNumber,
  ensurePositiveNumber,
  ensureSupportedCurrency,
  ensureSupportedCurrencyList,
  ensureString,
  parseCsv,
} from '../utils/validation.js';
import { asBigInt, parseJsonArray, parseJsonObject } from '../utils/parsing.js';
import { KNOWN_PLATFORMS, SUPPORTED_CURRENCIES } from '../utils/constants.js';

const PLATFORM_NAME_BY_HASH = new Map(
  KNOWN_PLATFORMS.map((platform) => [keccak256(stringToHex(platform)).toLowerCase(), platform]),
);

const CURRENCY_NAME_BY_HASH = new Map(
  SUPPORTED_CURRENCIES.map((currency) => [keccak256(stringToHex(currency)).toLowerCase(), currency]),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveHashName(hashMap: Map<string, string>, value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return hashMap.get(value.toLowerCase());
}

function formatMinConversionRate(value: unknown): string | undefined {
  if (typeof value === 'bigint') {
    return formatUnits(value, 18);
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return formatUnits(BigInt(value), 18);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return formatUnits(BigInt(value), 18);
  }
  return undefined;
}

function enrichDepositCurrency(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const currencyName = resolveHashName(CURRENCY_NAME_BY_HASH, value.code);
  const minConversionRateDecimal = formatMinConversionRate(value.minConversionRate);
  return {
    ...value,
    ...(currencyName ? { currencyName } : {}),
    ...(minConversionRateDecimal ? { minConversionRateDecimal } : {}),
  };
}

function enrichDepositPaymentMethod(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const paymentMethodName = resolveHashName(PLATFORM_NAME_BY_HASH, value.paymentMethod);
  return {
    ...value,
    ...(paymentMethodName ? { paymentMethodName } : {}),
    ...(Array.isArray(value.currencies)
      ? { currencies: value.currencies.map(enrichDepositCurrency) }
      : {}),
  };
}

function enrichDepositReadableFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(enrichDepositReadableFields);
  }
  if (!isRecord(value) || !Array.isArray(value.paymentMethods)) {
    return value;
  }
  return {
    ...value,
    paymentMethods: value.paymentMethods.map(enrichDepositPaymentMethod),
  };
}

function sdkDepositReadHandler(
  path: readonly string[],
  buildArgs: (input: Record<string, unknown>, context: Parameters<NonNullable<CommandDefinition['handler']>>[1]) => Promise<unknown[]> | unknown[],
  options: { requireWallet?: boolean } = {},
) {
  const handler = sdkReadHandler(path, buildArgs, options);
  return async (input: Record<string, unknown>, context: Parameters<NonNullable<CommandDefinition['handler']>>[1]) =>
    enrichDepositReadableFields(await handler(input, context));
}

function parseConversionRate(value: unknown): string {
  return parseUnits(ensurePositiveNumber(value, 'rate').toString(), 18).toString();
}

const parseSupportedPlatforms = parseProcessorNames;

function parseSupportedCurrencies(value: unknown, fieldName: string): string[] {
  return ensureSupportedCurrencyList(parseCsv(value as string | undefined), fieldName) ?? [];
}

function parseConversionRates(input: Record<string, unknown>): { currency: string; conversionRate: string }[][] {
  if (input.conversionRates) {
    const conversionRates = parseJsonArray(input.conversionRates, 'conversionRates') as { currency?: unknown; conversionRate: string }[][];
    return conversionRates.map((entries, rowIndex) => entries.map((entry, entryIndex) => ({
      ...entry,
      currency: ensureSupportedCurrency(entry.currency, `conversionRates[${rowIndex}][${entryIndex}].currency`),
    })));
  }

  const processors = parseSupportedPlatforms(input.platforms, 'platforms');
  const currencies = parseSupportedCurrencies(input.currencies, 'currencies');
  if (processors.length === 0 || currencies.length === 0 || input.rate === undefined) {
    throw createError('VALIDATION_ERROR', 'Provide --conversion-rates JSON or --platforms, --currencies, and --rate.');
  }

  return processors.map(() => currencies.map((currency) => ({ currency, conversionRate: parseConversionRate(input.rate) })));
}

function parseDepositDataEntries(input: Record<string, unknown>, processorNames: string[]): Record<string, unknown>[] {
  if (processorNames.length === 0) {
    return parsePayeeDepositData(input.depositData, processorNames);
  }
  return parsePayeeDepositData(input.depositData, processorNames, {
    requiredMessage: 'Provide --deposit-data as a JSON array with one platform-specific detail object per entry in --platforms.',
    missingDetails: {
      platforms: processorNames,
      example: "--platforms wise,venmo --deposit-data '[{...wiseDetails},{...venmoDetails}]'",
      note: 'Use the same processor-specific detail objects accepted by payee register.',
    },
  });
}

async function withUsdcAddress<T>(
  input: Record<string, unknown>,
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
  builder: (token: string) => Promise<T> | T,
): Promise<T> {
  const { client } = await context.getClient({ requireWallet: true });
  const token = (input.token as string | undefined) ?? client.getUsdcAddress();
  if (!token) {
    throw createError('CONFIG_ERROR', 'USDC address is not available for the current runtime environment.');
  }
  return builder(token);
}

async function getAllowancePreview(
  input: Record<string, unknown>,
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
): Promise<{
  token: `0x${string}`;
  spender: `0x${string}`;
  amount: bigint;
  approvalAmount: bigint;
  currentAllowance: bigint;
}> {
  const { client, publicClient, walletClient } = await context.getClient({ requireWallet: true });
  const account = walletClient.account;
  if (!account) {
    throw createError('AUTH_REQUIRED', 'This command requires a signer account.');
  }

  const token = ensureAddress(
    ((input.token as string | undefined) ?? client.getUsdcAddress()) as string | undefined,
    'token',
  );
  const amount = parseUnits(ensurePositiveNumber(input.amount, 'amount').toString(), 6);
  const deployed = client.getDeployedAddresses();
  const spender = ensureAddress((deployed.escrowV2 ?? deployed.escrow) as `0x${string}`, 'spender');
  const currentAllowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, spender],
  });
  const approvalAmount = Boolean(input.maxApprove) ? (1n << 256n) - 1n : amount;

  return {
    token,
    spender,
    amount,
    approvalAmount,
    currentAllowance,
  };
}

const filterOption = { name: 'filter', flags: '--filter <json>', description: 'JSON filter object.', schema: { type: 'object', description: 'Filter object.' } } as const;
const paginationOption = { name: 'pagination', flags: '--pagination <json>', description: 'JSON pagination object.', schema: { type: 'object', description: 'Pagination object.' } } as const;

export const depositDefinitions: CommandDefinition[] = [
  {
    path: ['deposit', 'ensure-allowance'],
    description: 'Approve USDC spending if required.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'amount', flags: '--amount <value>', description: 'USDC amount to approve.', schema: { type: 'number', description: 'USDC amount.' } },
      { name: 'token', flags: '--token <address>', description: 'Token address override.', schema: { type: 'string', description: 'ERC20 token address.' } },
      { name: 'maxApprove', flags: '--max-approve', description: 'Approve MaxUint256 instead of exact amount.', schema: { type: 'boolean', description: 'Approve max amount.' } },
    ],
    handler: async (input, context) => {
      const previewData = await getAllowancePreview(input, context);
      if (previewData.currentAllowance >= previewData.amount) {
        return {
          hadAllowance: true,
          token: previewData.token,
          spender: previewData.spender,
          currentAllowance: previewData.currentAllowance.toString(),
          requiredAmount: previewData.amount.toString(),
        };
      }

      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [previewData.spender, previewData.approvalAmount],
      });

      return context.runPrepared({
        description: `Approve ${previewData.approvalAmount.toString()} units for spender ${previewData.spender}.`,
        prepare: async () => ({
          prepared: {
            to: previewData.token,
            data,
            value: 0n,
            chainId: 8453,
          },
          previewData: {
            token: previewData.token,
            spender: previewData.spender,
            currentAllowance: previewData.currentAllowance.toString(),
            requiredAmount: previewData.amount.toString(),
            approvalAmount: previewData.approvalAmount.toString(),
          },
        }),
        execute: async () => {
          const { client } = await context.getClient({ requireWallet: true });
          return client.ensureAllowance({
            token: previewData.token,
            spender: previewData.spender,
            amount: previewData.amount,
            maxApprove: Boolean(input.maxApprove),
          });
        },
      });
    },
  },
  {
    path: ['deposit', 'create'],
    description: 'Create a new deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'amount', flags: '--amount <value>', description: 'Required. USDC amount to deposit.', schema: { type: 'number', description: 'USDC amount.' } },
      { name: 'min', flags: '--min <value>', description: 'Required. Minimum intent size in USDC.', schema: { type: 'number', description: 'Minimum intent size.' } },
      { name: 'max', flags: '--max <value>', description: 'Required. Maximum intent size in USDC.', schema: { type: 'number', description: 'Maximum intent size.' } },
      { name: 'platforms', flags: '--platforms <names>', description: 'Required. Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'currencies', flags: '--currencies <codes>', description: 'Required when --conversion-rates is omitted. Comma-separated fiat currencies.', schema: { type: 'string', description: 'Fiat currencies.' } },
      { name: 'rate', flags: '--rate <value>', description: 'Required when --conversion-rates is omitted. Default conversion rate.', schema: { type: 'number', description: 'Conversion rate.' } },
      { name: 'conversionRates', flags: '--conversion-rates <json>', description: 'JSON matrix of conversion rate entries.', schema: { type: 'array', description: 'Conversion rate matrix.' } },
      { name: 'depositData', flags: '--deposit-data <json>', description: 'Required when --platforms is set. JSON array with one platform-specific detail object per platform.', schema: { type: 'array', description: 'Deposit data array.' } },
      { name: 'delegate', flags: '--delegate <address>', description: 'Optional delegate address.', schema: { type: 'string', description: 'Delegate address.' } },
      { name: 'intentGuardian', flags: '--intent-guardian <address>', description: 'Optional intent guardian address.', schema: { type: 'string', description: 'Intent guardian.' } },
      { name: 'retainOnEmpty', flags: '--retain-on-empty', description: 'Keep the deposit config active at zero balance.', schema: { type: 'boolean', description: 'Retain deposit on empty.' } },
      { name: 'token', flags: '--token <address>', description: 'Token address override.', schema: { type: 'string', description: 'ERC20 token address.' } },
    ],
    handler: sdkSeparatePrepareHandler(
      ['prepareCreateDeposit'],
      ['createDeposit'],
      async (input, context) => withUsdcAddress(input, context, async (token) => {
        const processorNames = parseSupportedPlatforms(input.platforms, 'platforms');
        return {
          token: ensureAddress(token, 'token'),
          amount: parseUnits(ensurePositiveNumber(input.amount, 'amount').toString(), 6),
          intentAmountRange: {
            min: parseUnits(ensurePositiveNumber(input.min, 'min').toString(), 6),
            max: parseUnits(ensurePositiveNumber(input.max, 'max').toString(), 6),
          },
          processorNames,
          depositData: parseDepositDataEntries(input, processorNames),
          conversionRates: parseConversionRates(input),
          delegate: input.delegate ? ensureAddress(input.delegate, 'delegate') : undefined,
          intentGuardian: input.intentGuardian ? ensureAddress(input.intentGuardian, 'intentGuardian') : undefined,
          retainOnEmpty: Boolean(input.retainOnEmpty),
        };
      }),
      {
        description: () => 'Create a deposit after previewing the transaction calldata.',
        previewData: (prepared) => (prepared as { depositDetails?: unknown }).depositDetails,
      },
    ),
  },
  {
    path: ['deposit', 'list'],
    description: 'List deposits owned by the configured wallet or explicit owner.',
    readOnly: true,
    options: [
      { name: 'owner', flags: '--owner <address>', description: 'Owner address override.', schema: { type: 'string', description: 'Owner address.' } },
    ],
    handler: async (input, context) => {
      const { client, walletClient } = await context.getClient({ requireWallet: false });
      const owner = input.owner ? ensureAddress(input.owner, 'owner') : walletClient.account?.address;
      const result = owner ? await client.getAccountDeposits(owner) : await client.getDeposits();
      return enrichDepositReadableFields(result);
    },
  },
  {
    path: ['deposit', 'show'],
    description: 'Show a single deposit by deposit ID.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' }, optionFlags: ['--id <depositId>'] }],
    handler: sdkDepositReadHandler(['getDeposit'], async (input) => [asBigInt(input.depositId, 'depositId')]),
  },
  {
    path: ['deposit', 'show-many'],
    description: 'Show multiple deposits by ID.',
    readOnly: true,
    options: [{ name: 'ids', flags: '--ids <csv>', description: 'Comma-separated deposit IDs.', schema: { type: 'string', description: 'Deposit IDs.' } }],
    handler: sdkDepositReadHandler(['getDepositsById'], async (input) => [(parseCsv(input.ids as string | undefined) ?? []).map((value) => BigInt(value))]),
  },
  {
    path: ['deposit', 'add-funds'],
    description: 'Add liquidity to a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'amount', flags: '--amount <value>', description: 'USDC amount to add.', schema: { type: 'number', description: 'USDC amount.' } },
    ],
    handler: sdkWriteHandler(['addFunds'], async (input) => ({ depositId: asBigInt(input.id, 'id'), amount: parseUnits(ensurePositiveNumber(input.amount, 'amount').toString(), 6) })),
  },
  {
    path: ['deposit', 'remove-funds'],
    description: 'Remove liquidity from a deposit.',
    readOnly: false,
    dangerous: true,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'amount', flags: '--amount <value>', description: 'USDC amount to remove.', schema: { type: 'number', description: 'USDC amount.' } },
    ],
    handler: sdkWriteHandler(['removeFunds'], async (input) => ({ depositId: asBigInt(input.id, 'id'), amount: parseUnits(ensurePositiveNumber(input.amount, 'amount').toString(), 6) })),
  },
  {
    path: ['deposit', 'withdraw'],
    description: 'Withdraw and close a deposit. This is irreversible.',
    readOnly: false,
    dangerous: true,
    requireWallet: true,
    options: [{ name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkWriteHandler(['withdrawDeposit'], async (input) => ({ depositId: asBigInt(input.id, 'id') })),
  },
  {
    path: ['deposit', 'pause'],
    description: 'Pause new intents on a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkWriteHandler(['setAcceptingIntents'], async (input) => ({ depositId: asBigInt(input.id, 'id'), accepting: false })),
  },
  {
    path: ['deposit', 'resume'],
    description: 'Resume new intents on a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkWriteHandler(['setAcceptingIntents'], async (input) => ({ depositId: asBigInt(input.id, 'id'), accepting: true })),
  },
  {
    path: ['deposit', 'set-range'],
    description: 'Set a deposit intent range.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'min', flags: '--min <value>', description: 'Minimum intent amount.', schema: { type: 'number', description: 'Minimum intent.' } },
      { name: 'max', flags: '--max <value>', description: 'Maximum intent amount.', schema: { type: 'number', description: 'Maximum intent.' } },
    ],
    handler: sdkWriteHandler(['setIntentRange'], async (input) => {
      const min = ensurePositiveNumber(input.min, 'min');
      const max = ensurePositiveNumber(input.max, 'max');
      if (min > max) {
        throw createError('VALIDATION_ERROR', `--min (${min}) must be less than or equal to --max (${max}).`);
      }
      return {
        depositId: asBigInt(input.id, 'id'),
        min: parseUnits(min.toString(), 6),
        max: parseUnits(max.toString(), 6),
      };
    }),
  },
  {
    path: ['deposit', 'set-rate'],
    description: 'Set the minimum conversion rate for a deposit currency.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethod', flags: '--payment-method <name>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'currency', flags: '--currency <code>', description: 'Fiat currency code.', schema: { type: 'string', description: 'Fiat currency.' } },
      { name: 'rate', flags: '--rate <value>', description: 'Conversion rate as human decimal.', schema: { type: 'number', description: 'Conversion rate.' } },
    ],
    handler: sdkWriteHandler(['setCurrencyMinRate'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethod: ensureString(input.paymentMethod, 'paymentMethod'),
      fiatCurrency: ensureSupportedCurrency(input.currency, 'currency'),
      minConversionRate: parseConversionRate(input.rate),
    })),
  },
  {
    path: ['deposit', 'set-retain-on-empty'],
    description: 'Toggle retainOnEmpty for a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'retain', flags: '--retain', description: 'Enable retainOnEmpty.', schema: { type: 'boolean', description: 'Retain on empty.' } },
    ],
    handler: sdkWriteHandler(['setRetainOnEmpty'], async (input) => ({ depositId: asBigInt(input.id, 'id'), retain: Boolean(input.retain) })),
  },
  {
    path: ['deposit', 'set-delegate'],
    description: 'Assign a delegate that can manage a deposit on behalf of the owner.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'delegate', flags: '--delegate <address>', description: 'Delegate address.', schema: { type: 'string', description: 'Delegate address.' } },
      { name: 'escrowAddress', flags: '--escrow-address <address>', description: 'Escrow address override.', schema: { type: 'string', description: 'Escrow address.' } },
    ],
    handler: sdkWriteHandler(['setDelegate'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      delegate: ensureAddress(input.delegate, 'delegate'),
      escrowAddress: input.escrowAddress ? ensureAddress(input.escrowAddress, 'escrowAddress') : undefined,
    })),
  },
  {
    path: ['deposit', 'remove-delegate'],
    description: 'Remove the delegate assigned to a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'escrowAddress', flags: '--escrow-address <address>', description: 'Escrow address override.', schema: { type: 'string', description: 'Escrow address.' } },
    ],
    handler: sdkWriteHandler(['removeDelegate'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      escrowAddress: input.escrowAddress ? ensureAddress(input.escrowAddress, 'escrowAddress') : undefined,
    })),
  },
  {
    path: ['deposit', 'payment-method', 'add'],
    description: 'Add payment methods to a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethods', flags: '--payment-methods <csv>', description: 'Comma-separated payment methods.', schema: { type: 'string', description: 'Payment methods.' } },
      { name: 'paymentMethodData', flags: '--payment-method-data <json>', description: 'JSON array of payment method data.', schema: { type: 'array', description: 'Payment method data.' } },
      { name: 'currencies', flags: '--currencies <json>', description: 'JSON matrix of currencies per payment method.', schema: { type: 'array', description: 'Currency matrix.' } },
    ],
    handler: sdkWriteHandler(['addPaymentMethods'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethods: parseCsv(input.paymentMethods as string | undefined) ?? [],
      paymentMethodData: parseJsonArray(input.paymentMethodData, 'paymentMethodData'),
      currencies: parseJsonArray(input.currencies, 'currencies'),
    })),
  },
  {
    path: ['deposit', 'payment-method', 'set-active'],
    description: 'Set payment method active state.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethod', flags: '--payment-method <name>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'active', flags: '--active', description: 'Mark the payment method as active.', schema: { type: 'boolean', description: 'Active flag.' } },
    ],
    handler: sdkWriteHandler(['setPaymentMethodActive'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethod: ensureString(input.paymentMethod, 'paymentMethod'),
      isActive: Boolean(input.active),
    })),
  },
  {
    path: ['deposit', 'payment-method', 'remove'],
    description: 'Remove a payment method from a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethod', flags: '--payment-method <name>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
    ],
    handler: sdkWriteHandler(['removePaymentMethod'], async (input) => ({ depositId: asBigInt(input.id, 'id'), paymentMethod: ensureString(input.paymentMethod, 'paymentMethod') })),
  },
  {
    path: ['deposit', 'currency', 'add'],
    description: 'Add currencies to a payment method.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethod', flags: '--payment-method <name>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'currencies', flags: '--currencies <csv>', description: 'Comma-separated currencies.', schema: { type: 'string', description: 'Currencies.' } },
    ],
    handler: sdkWriteHandler(['addCurrencies'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethod: ensureString(input.paymentMethod, 'paymentMethod'),
      currencies: parseSupportedCurrencies(input.currencies, 'currencies'),
    })),
  },
  {
    path: ['deposit', 'currency', 'deactivate'],
    description: 'Deactivate a currency on a payment method.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethod', flags: '--payment-method <name>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'currency', flags: '--currency <code>', description: 'Currency code.', schema: { type: 'string', description: 'Currency code.' } },
    ],
    handler: sdkWriteHandler(['deactivateCurrency'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethod: ensureString(input.paymentMethod, 'paymentMethod'),
      currencyCode: ensureSupportedCurrency(input.currency, 'currency'),
    })),
  },
  {
    path: ['deposit', 'currency', 'remove'],
    description: 'Remove a currency from a payment method.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethod', flags: '--payment-method <name>', description: 'Payment method name or hash.', schema: { type: 'string', description: 'Payment method.' } },
      { name: 'currency', flags: '--currency <code>', description: 'Currency code.', schema: { type: 'string', description: 'Currency code.' } },
    ],
    handler: sdkWriteHandler(['removeCurrency'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethod: ensureString(input.paymentMethod, 'paymentMethod'),
      currencyCode: ensureSupportedCurrency(input.currency, 'currency'),
    })),
  },
  {
    path: ['deposit', 'prune-intents'],
    description: 'Prune expired intents for a deposit.',
    readOnly: false,
    requireWallet: true,
    options: [{ name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } }],
    handler: sdkWriteHandler(['pruneExpiredIntents'], async (input) => ({ depositId: asBigInt(input.id, 'id') })),
  },
  {
    path: ['deposit', 'oracle', 'set'],
    description: 'Set an oracle rate config for a deposit currency.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethodHash', flags: '--payment-method-hash <hash>', description: 'Payment method hash.', schema: { type: 'string', description: 'Payment method hash.' } },
      { name: 'currencyHash', flags: '--currency-hash <hash>', description: 'Currency hash.', schema: { type: 'string', description: 'Currency hash.' } },
      { name: 'config', flags: '--config <json>', description: 'Oracle config JSON object.', schema: { type: 'object', description: 'Oracle config.' } },
    ],
    handler: sdkWriteHandler(['setOracleRateConfig'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethodHash: ensureString(input.paymentMethodHash, 'paymentMethodHash'),
      currencyHash: ensureString(input.currencyHash, 'currencyHash'),
      config: parseJsonObject(input.config, 'config'),
    })),
  },
  {
    path: ['deposit', 'oracle', 'remove'],
    description: 'Remove an oracle rate config from a deposit currency.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethodHash', flags: '--payment-method-hash <hash>', description: 'Payment method hash.', schema: { type: 'string', description: 'Payment method hash.' } },
      { name: 'currencyHash', flags: '--currency-hash <hash>', description: 'Currency hash.', schema: { type: 'string', description: 'Currency hash.' } },
    ],
    handler: sdkWriteHandler(['removeOracleRateConfig'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethodHash: ensureString(input.paymentMethodHash, 'paymentMethodHash'),
      currencyHash: ensureString(input.currencyHash, 'currencyHash'),
    })),
  },
  {
    path: ['deposit', 'oracle', 'set-batch'],
    description: 'Set oracle configs in batch.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethods', flags: '--payment-methods <json>', description: 'JSON array of payment method hashes.', schema: { type: 'array', description: 'Payment method hashes.' } },
      { name: 'currencies', flags: '--currencies <json>', description: 'JSON matrix of currency hashes.', schema: { type: 'array', description: 'Currency hash matrix.' } },
      { name: 'configs', flags: '--configs <json>', description: 'JSON matrix of oracle configs.', schema: { type: 'array', description: 'Oracle config matrix.' } },
    ],
    handler: sdkWriteHandler(['setOracleRateConfigBatch'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethods: parseJsonArray(input.paymentMethods, 'paymentMethods'),
      currencies: parseJsonArray(input.currencies, 'currencies'),
      configs: parseJsonArray(input.configs, 'configs'),
    })),
  },
  {
    path: ['deposit', 'currency-config', 'update-batch'],
    description: 'Update currency config batch.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethods', flags: '--payment-methods <json>', description: 'JSON array of payment methods.', schema: { type: 'array', description: 'Payment methods.' } },
      { name: 'updates', flags: '--updates <json>', description: 'JSON matrix of updates.', schema: { type: 'array', description: 'Updates matrix.' } },
    ],
    handler: sdkWriteHandler(['updateCurrencyConfigBatch'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethods: parseJsonArray(input.paymentMethods, 'paymentMethods'),
      updates: parseJsonArray(input.updates, 'updates'),
    })),
  },
  {
    path: ['deposit', 'currency', 'deactivate-batch'],
    description: 'Deactivate currencies in batch.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'id', flags: '--id <depositId>', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' } },
      { name: 'paymentMethods', flags: '--payment-methods <json>', description: 'JSON array of payment methods.', schema: { type: 'array', description: 'Payment methods.' } },
      { name: 'currencyCodes', flags: '--currency-codes <json>', description: 'JSON matrix of currency codes.', schema: { type: 'array', description: 'Currency code matrix.' } },
    ],
    handler: sdkWriteHandler(['deactivateCurrenciesBatch'], async (input) => ({
      depositId: asBigInt(input.id, 'id'),
      paymentMethods: parseJsonArray(input.paymentMethods, 'paymentMethods'),
      currencyCodes: parseJsonArray(input.currencyCodes, 'currencyCodes'),
    })),
  },
  {
    path: ['pv', 'deposit', 'show'],
    description: 'Fetch a deposit directly from ProtocolViewer.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Deposit ID.', schema: { type: 'string', description: 'Deposit ID.' }, optionFlags: ['--id <depositId>'] }],
    handler: sdkDepositReadHandler(['getPvDepositById'], async (input) => [ensureString(input.depositId, 'depositId')]),
  },
  {
    path: ['pv', 'deposit', 'show-many'],
    description: 'Fetch multiple deposits directly from ProtocolViewer.',
    readOnly: true,
    options: [{ name: 'ids', flags: '--ids <csv>', description: 'Comma-separated deposit IDs.', schema: { type: 'string', description: 'Deposit IDs.' } }],
    handler: sdkDepositReadHandler(['getPvDepositsFromIds'], async (input) => [(parseCsv(input.ids as string | undefined) ?? [])]),
  },
  {
    path: ['pv', 'deposit', 'list-owner'],
    description: 'Fetch deposits for an owner directly from ProtocolViewer.',
    readOnly: true,
    options: [{ name: 'owner', flags: '--owner <address>', description: 'Owner address.', schema: { type: 'string', description: 'Owner address.' } }],
    handler: sdkDepositReadHandler(['getPvAccountDeposits'], async (input) => [ensureAddress(input.owner, 'owner')]),
  },
  {
    path: ['indexer', 'deposits', 'list'],
    description: 'List deposits via the indexer.',
    readOnly: true,
    options: [filterOption, paginationOption],
    handler: sdkReadHandler(['indexer', 'getDeposits'], async (input) => [input.filter ? parseJsonObject(input.filter, 'filter') : undefined, input.pagination ? parseJsonObject(input.pagination, 'pagination') : undefined]),
  },
  {
    path: ['indexer', 'deposits', 'list-relations'],
    description: 'List deposits with related entities via the indexer.',
    readOnly: true,
    options: [filterOption, paginationOption, { name: 'options', flags: '--options <json>', description: 'JSON options object.', schema: { type: 'object', description: 'Relation options.' } }],
    handler: sdkReadHandler(['indexer', 'getDepositsWithRelations'], async (input) => [
      input.filter ? parseJsonObject(input.filter, 'filter') : undefined,
      input.pagination ? parseJsonObject(input.pagination, 'pagination') : undefined,
      input.options ? parseJsonObject(input.options, 'options') : undefined,
    ]),
  },
  {
    path: ['indexer', 'deposits', 'show'],
    description: 'Fetch a deposit by composite ID via the indexer.',
    readOnly: true,
    args: [{ name: 'compositeId', description: 'Composite deposit ID.', schema: { type: 'string', description: 'Composite ID.' }, optionFlags: ['--id <compositeId>'] }],
    options: [{ name: 'options', flags: '--options <json>', description: 'JSON options object.', schema: { type: 'object', description: 'Relation options.' } }],
    handler: sdkReadHandler(['indexer', 'getDepositById'], async (input) => [ensureString(input.compositeId, 'compositeId'), input.options ? parseJsonObject(input.options, 'options') : undefined]),
  },
  {
    path: ['indexer', 'deposits', 'by-ids'],
    description: 'Fetch multiple deposits by composite ID.',
    readOnly: true,
    options: [{ name: 'ids', flags: '--ids <csv>', description: 'Comma-separated composite IDs.', schema: { type: 'string', description: 'Composite IDs.' } }],
    handler: sdkReadHandler(['indexer', 'getDepositsByIds'], async (input) => [(parseCsv(input.ids as string | undefined) ?? [])]),
  },
  {
    path: ['indexer', 'deposits', 'by-ids-relations'],
    description: 'Fetch multiple deposits with relations by composite ID.',
    readOnly: true,
    options: [
      { name: 'ids', flags: '--ids <csv>', description: 'Comma-separated composite IDs.', schema: { type: 'string', description: 'Composite IDs.' } },
      { name: 'options', flags: '--options <json>', description: 'JSON options object.', schema: { type: 'object', description: 'Relation options.' } },
    ],
    handler: sdkReadHandler(['indexer', 'getDepositsByIdsWithRelations'], async (input) => [(parseCsv(input.ids as string | undefined) ?? []), input.options ? parseJsonObject(input.options, 'options') : undefined]),
  },
  {
    path: ['indexer', 'deposits', 'fund-activities'],
    description: 'Fetch fund activities for a deposit.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Composite deposit ID.', schema: { type: 'string', description: 'Composite deposit ID.' }, optionFlags: ['--id <depositId>'] }],
    handler: sdkReadHandler(['indexer', 'getDepositFundActivities'], async (input) => [ensureString(input.depositId, 'depositId')]),
  },
  {
    path: ['indexer', 'makers', 'fund-activities'],
    description: 'Fetch maker-level fund activities.',
    readOnly: true,
    args: [{ name: 'maker', description: 'Maker address.', schema: { type: 'string', description: 'Maker address.' }, optionFlags: ['--address <address>', '--maker <address>'] }],
    options: [{ name: 'limit', flags: '--limit <count>', description: 'Maximum activities.', schema: { type: 'number', description: 'Activity limit.' } }],
    handler: sdkReadHandler(['indexer', 'getMakerFundActivities'], async (input) => [ensureAddress(input.maker, 'maker'), input.limit ? ensureNumber(input.limit, 'limit') : undefined]),
  },
  {
    path: ['indexer', 'deposits', 'snapshots'],
    description: 'Fetch deposit daily snapshots.',
    readOnly: true,
    args: [{ name: 'depositId', description: 'Composite deposit ID.', schema: { type: 'string', description: 'Composite deposit ID.' }, optionFlags: ['--id <depositId>'] }],
    options: [{ name: 'limit', flags: '--limit <count>', description: 'Maximum snapshot count.', schema: { type: 'number', description: 'Snapshot limit.' } }],
    handler: sdkReadHandler(['indexer', 'getDepositDailySnapshots'], async (input) => [ensureString(input.depositId, 'depositId'), input.limit ? ensureNumber(input.limit, 'limit') : undefined]),
  },
  {
    path: ['indexer', 'query'],
    description: 'Perform a raw GraphQL query against the indexer. Use sparingly; arbitrary queries can be expensive.',
    readOnly: true,
    options: [
      { name: 'query', flags: '--query <graphql>', description: 'GraphQL query string.', schema: { type: 'string', description: 'GraphQL query.' } },
      { name: 'variables', flags: '--variables <json>', description: 'Variables JSON object.', schema: { type: 'object', description: 'GraphQL variables.' } },
    ],
    handler: sdkReadHandler(['indexer', 'query'], async (input) => [{ query: ensureString(input.query, 'query'), variables: input.variables ? parseJsonObject(input.variables, 'variables') : undefined }]),
  },
];
