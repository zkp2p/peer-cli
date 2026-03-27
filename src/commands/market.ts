import type { CommandDefinition } from './framework.js';
import { sdkReadHandler } from './helpers.js';
import { createError } from '../output/errors.js';
import { SUPPORTED_MARKET_PERIODS, SUPPORTED_PLATFORMS } from '../utils/constants.js';
import { ensureAddress, ensureNumber, ensureOneOf, ensurePositiveNumber, ensureString, parseCsv } from '../utils/validation.js';
import { appendSearchParams } from '../utils/http.js';

function marketHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'x-api-key': apiKey } : {};
}

export const marketDefinitions: CommandDefinition[] = [
  {
    path: ['market', 'spreads'],
    description: 'Fetch current market spreads from Peerlytics.',
    readOnly: true,
    options: [
      { name: 'platform', flags: '--platform <value>', description: 'Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Comma-separated fiat currencies.', schema: { type: 'string', description: 'Fiat currencies.' } },
      { name: 'includeRates', flags: '--include-rates', description: 'Include per-rate-level entries in each market.', schema: { type: 'boolean', description: 'Include rate entries.' } },
      { name: 'limit', flags: '--limit <value>', description: 'Maximum markets to return.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 200 },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('v1/market/summary', context.config.marketBaseUrl), {
        platform: parseCsv(input.platform as string | undefined)?.join(','),
        currency: parseCsv(input.currency as string | undefined)?.join(','),
        includeRates: input.includeRates ? 'true' : undefined,
        limit: ensureNumber(input.limit ?? 200, 'limit'),
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
    description: 'Fetch Peerlytics protocol volume and analytics for a time range.',
    readOnly: true,
    options: [
      { name: 'platform', flags: '--platform <value>', description: 'Comma-separated payment platform filter.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Comma-separated fiat currency filter.', schema: { type: 'string', description: 'Fiat currencies.' } },
      { name: 'range', flags: '--range <value>', description: 'Analytics range: mtd, 3mtd, ytd, all.', schema: { type: 'string', description: 'Analytics range.' }, defaultValue: 'mtd' },
    ],
    handler: async (input, context) => {
      const range = ensureOneOf(input.range ?? 'mtd', 'range', SUPPORTED_MARKET_PERIODS);
      const url = appendSearchParams(new URL('v1/analytics/period', context.config.marketBaseUrl), {
        range,
        platform: parseCsv(input.platform as string | undefined)?.join(','),
        currency: parseCsv(input.currency as string | undefined)?.join(','),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'leaderboard'],
    description: 'Fetch maker and taker leaderboard data from Peerlytics.',
    readOnly: true,
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum entries per leaderboard.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 20 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('v1/analytics/leaderboard', context.config.marketBaseUrl), {
        limit: ensureNumber(input.limit ?? 20, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
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
      const url = new URL('v1/analytics/summary', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
];
