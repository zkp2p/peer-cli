import type { CommandDefinition } from './framework.js';
import { sdkReadHandler } from './helpers.js';
import { createError } from '../output/errors.js';
import { SUPPORTED_MARKET_GRANULARITIES, SUPPORTED_MARKET_PERIODS, SUPPORTED_PLATFORMS } from '../utils/constants.js';
import { ensureAddress, ensureNumber, ensureOneOf, ensurePositiveNumber, ensureString, parseCsv } from '../utils/validation.js';

function appendSearchParams(url: URL, values: Record<string, string | number | undefined>): URL {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function marketHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'x-api-key': apiKey } : {};
}

function normalizeVolumePeriod(period: string): (typeof SUPPORTED_MARKET_PERIODS)[number] {
  if (period === '24h') return '1d';
  return ensureOneOf(period, 'period', SUPPORTED_MARKET_PERIODS);
}

export const marketDefinitions: CommandDefinition[] = [
  {
    path: ['market', 'spreads'],
    description: 'Fetch current market spreads from Peerlytics.',
    readOnly: true,
    options: [
      { name: 'platform', flags: '--platform <value>', description: 'Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Comma-separated fiat currencies.', schema: { type: 'string', description: 'Fiat currencies.' } },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('/v1/spreads', context.config.marketBaseUrl), {
        paymentPlatforms: parseCsv(input.platform as string | undefined)?.join(','),
        fiatCurrencies: parseCsv(input.currency as string | undefined)?.join(','),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'compare'],
    description: 'Compare live quote availability across platforms using the published SDK quote route.',
    readOnly: true,
    options: [
      { name: 'from', flags: '--from <currency>', description: 'Fiat currency code.', schema: { type: 'string', description: 'Fiat currency code.' } },
      { name: 'amount', flags: '--amount <value>', description: 'Quote amount.', schema: { type: 'number', description: 'Fiat amount.' } },
      { name: 'platform', flags: '--platform <value>', description: 'Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'recipient', flags: '--recipient <address>', description: 'Recipient wallet address.', schema: { type: 'string', description: 'Recipient address.' } },
      { name: 'quotesToReturn', flags: '--quotes-to-return <count>', description: 'Number of quotes to request.', schema: { type: 'number', description: 'Quote count.' }, defaultValue: 10 },
    ],
    handler: sdkReadHandler(['getQuote'], async (input, context) => {
      const { client, walletClient } = await context.getClient({ requireWallet: false });
      const caller = walletClient.account?.address;
      if (!caller && !input.recipient) {
        throw createError('AUTH_REQUIRED', 'Provide --recipient for market compare when no wallet is configured.');
      }
      const recipient = input.recipient ? ensureAddress(input.recipient, 'recipient') : caller;
      if (!recipient) {
        throw createError('AUTH_REQUIRED', 'Unable to resolve recipient address.');
      }

      return [{
        paymentPlatforms: parseCsv(input.platform as string | undefined) ?? [...SUPPORTED_PLATFORMS],
        fiatCurrency: ensureString(input.from, 'from'),
        amount: ensurePositiveNumber(input.amount, 'amount').toString(),
        isExactFiat: true,
        recipient,
        user: caller ?? recipient,
        destinationChainId: 8453,
        destinationToken: ensureAddress(client.getUsdcAddress(), 'destinationToken'),
        quotesToReturn: ensureNumber(input.quotesToReturn ?? 10, 'quotesToReturn'),
      }];
    }),
  },
  {
    path: ['market', 'volume'],
    description: 'Fetch Peerlytics protocol volume metrics.',
    readOnly: true,
    options: [
      { name: 'platform', flags: '--platform <value>', description: 'Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Fiat currency code.', schema: { type: 'string', description: 'Fiat currency.' } },
      { name: 'period', flags: '--period <value>', description: 'Volume lookback window: 24h, 7d, 30d, 90d.', schema: { type: 'string', description: 'Lookback window.' }, defaultValue: '24h' },
      { name: 'granularity', flags: '--granularity <value>', description: 'Aggregation granularity.', schema: { type: 'string', description: 'Granularity.' }, defaultValue: 'daily' },
    ],
    handler: async (input, context) => {
      const period = normalizeVolumePeriod(ensureString(input.period ?? '24h', 'period'));
      const granularity = ensureOneOf(input.granularity ?? 'daily', 'granularity', SUPPORTED_MARKET_GRANULARITIES);
      const url = appendSearchParams(new URL('/v1/volume', context.config.marketBaseUrl), {
        paymentPlatforms: parseCsv(input.platform as string | undefined)?.join(','),
        fiatCurrency: input.currency ? ensureString(input.currency, 'currency') : undefined,
        period,
        granularity,
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'leaderboard'],
    description: 'Fetch maker leaderboard data from Peerlytics.',
    readOnly: true,
    options: [
      { name: 'period', flags: '--period <value>', description: 'Leaderboard lookback window.', schema: { type: 'string', description: 'Lookback window.' }, defaultValue: '7d' },
      { name: 'limit', flags: '--limit <value>', description: 'Maximum number of makers to return.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 10 },
      { name: 'sortBy', flags: '--sort-by <value>', description: 'Sort order: volume, fillRate, txCount.', schema: { type: 'string', description: 'Sort field.' }, defaultValue: 'volume' },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('/v1/leaderboard/makers', context.config.marketBaseUrl), {
        period: ensureString(input.period ?? '7d', 'period'),
        limit: ensureNumber(input.limit ?? 10, 'limit'),
        sortBy: ensureString(input.sortBy ?? 'volume', 'sortBy'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'protocol-stats'],
    description: 'Fetch aggregate Peerlytics protocol statistics.',
    readOnly: true,
    handler: async (_input, context) => {
      const url = new URL('/v1/protocol/stats', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
];
