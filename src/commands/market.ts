import type { CommandDefinition } from './framework.js';
import { sdkReadHandler } from './helpers.js';
import { createError } from '../output/errors.js';
import { DEFAULT_CHAIN_ID, SUPPORTED_MARKET_PERIODS, SUPPORTED_PLATFORMS } from '../utils/constants.js';
import {
  amountToUnits,
  ensureAddress,
  ensureNumber,
  ensureOneOf,
  ensureString,
  ensureSupportedCurrency,
  ensureSupportedCurrencyList,
  ensureSupportedPlatformList,
  parseCsv,
} from '../utils/validation.js';
import { appendSearchParams } from '../utils/http.js';

const FIAT_AMOUNT_DECIMALS = 6;

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
      const platforms = ensureSupportedPlatformList(parseCsv(input.platform as string | undefined), 'platform');
      const currencies = ensureSupportedCurrencyList(parseCsv(input.currency as string | undefined), 'currency');
      const url = appendSearchParams(new URL('v1/market/summary', context.config.marketBaseUrl), {
        platform: platforms?.join(','),
        currency: currencies?.join(','),
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
      const recipient = input.recipient ? ensureAddress(input.recipient, 'recipient') : caller!;

      return [{
        paymentPlatforms: ensureSupportedPlatformList(parseCsv(input.platform as string | undefined) ?? [...SUPPORTED_PLATFORMS], 'platform'),
        fiatCurrency: ensureSupportedCurrency(input.from, 'from'),
        amount: amountToUnits(input.amount, 'amount', FIAT_AMOUNT_DECIMALS).toString(),
        isExactFiat: true,
        recipient,
        user: caller ?? recipient,
        destinationChainId: DEFAULT_CHAIN_ID,
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
      const platforms = ensureSupportedPlatformList(parseCsv(input.platform as string | undefined), 'platform');
      const currencies = ensureSupportedCurrencyList(parseCsv(input.currency as string | undefined), 'currency');
      const url = appendSearchParams(new URL('v1/analytics/period', context.config.marketBaseUrl), {
        range,
        platform: platforms?.join(','),
        currency: currencies?.join(','),
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

  // --- Analytics extensions ---

  {
    path: ['market', 'analytics'],
    description: 'Fetch Peerlytics analytics by dimension slice.',
    readOnly: true,
    args: [
      { name: 'slice', description: 'Analytics slice: by-platform, by-currency, by-maker, etc.', schema: { type: 'string', description: 'Dimension slice.' } },
    ],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum entries.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const slice = ensureString(input.slice, 'slice');
      const url = appendSearchParams(new URL(`v1/analytics/${encodeURIComponent(slice)}`, context.config.marketBaseUrl), {
        limit: ensureNumber(input.limit ?? 50, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'vaults'],
    description: 'Fetch Peerlytics vault analytics.',
    readOnly: true,
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum entries.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('v1/analytics/vaults', context.config.marketBaseUrl), {
        limit: ensureNumber(input.limit ?? 50, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'attribution'],
    description: 'Fetch Peerlytics attribution analytics.',
    readOnly: true,
    handler: async (_input, context) => {
      const url = new URL('v1/analytics/attribution', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },

  // --- Explorer ---

  {
    path: ['market', 'explorer', 'address'],
    description: 'Look up a wallet address profile on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'address', description: 'Wallet address.', schema: { type: 'string', description: 'Address.' } },
    ],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum linked entries.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 100 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const address = ensureAddress(input.address, 'address');
      const url = appendSearchParams(new URL(`v1/explorer/address/${address}`, context.config.marketBaseUrl), {
        limit: ensureNumber(input.limit ?? 100, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'explorer', 'deposit'],
    description: 'Look up a deposit on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'id', description: 'Deposit ID (numeric or composite 0x..._123).', schema: { type: 'string', description: 'Deposit ID.' } },
    ],
    options: [
      { name: 'limit', flags: '--limit <value>', description: 'Maximum linked entries.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 100 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const id = ensureString(input.id, 'id');
      const url = appendSearchParams(new URL(`v1/explorer/deposit/${encodeURIComponent(id)}`, context.config.marketBaseUrl), {
        limit: ensureNumber(input.limit ?? 100, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'explorer', 'intent'],
    description: 'Look up an intent on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'hash', description: 'Intent hash.', schema: { type: 'string', description: 'Intent hash.' } },
    ],
    handler: async (input, context) => {
      const hash = ensureString(input.hash, 'hash');
      const url = new URL(`v1/explorer/intent/${encodeURIComponent(hash)}`, context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'explorer', 'maker'],
    description: 'Look up a maker profile on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'address', description: 'Maker wallet address.', schema: { type: 'string', description: 'Maker address.' } },
    ],
    handler: async (input, context) => {
      const address = ensureAddress(input.address, 'address');
      const url = new URL(`v1/explorer/maker/${address}`, context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'explorer', 'verifier'],
    description: 'Look up a verifier profile on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'address', description: 'Verifier address.', schema: { type: 'string', description: 'Verifier address.' } },
    ],
    handler: async (input, context) => {
      const address = ensureAddress(input.address, 'address');
      const url = new URL(`v1/explorer/verifier/${address}`, context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'explorer', 'vault'],
    description: 'Look up a vault on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'id', description: 'Vault ID.', schema: { type: 'string', description: 'Vault ID.' } },
    ],
    handler: async (input, context) => {
      const id = ensureString(input.id, 'id');
      const url = new URL(`v1/explorer/vault/${encodeURIComponent(id)}`, context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'explorer', 'search'],
    description: 'Search across addresses, deposits, intents, and vaults on Peerlytics.',
    readOnly: true,
    args: [
      { name: 'query', description: 'Search query (address, hash, deposit ID, etc.).', schema: { type: 'string', description: 'Search query.' } },
    ],
    handler: async (input, context) => {
      const query = ensureString(input.query, 'query');
      const url = appendSearchParams(new URL('v1/explorer/search', context.config.marketBaseUrl), { q: query });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },

  // --- Data queries ---

  {
    path: ['market', 'deposits'],
    description: 'Query deposits from Peerlytics with filtering.',
    readOnly: true,
    options: [
      { name: 'depositor', flags: '--depositor <address>', description: 'Filter by depositor address.', schema: { type: 'string', description: 'Depositor address.' } },
      { name: 'delegate', flags: '--delegate <address>', description: 'Filter by delegate address.', schema: { type: 'string', description: 'Delegate address.' } },
      { name: 'platform', flags: '--platform <value>', description: 'Comma-separated payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'currency', flags: '--currency <value>', description: 'Comma-separated fiat currencies.', schema: { type: 'string', description: 'Fiat currencies.' } },
      { name: 'status', flags: '--status <value>', description: 'ACTIVE or CLOSED.', schema: { type: 'string', description: 'Deposit status.' } },
      { name: 'accepting', flags: '--accepting', description: 'Only show deposits accepting intents.', schema: { type: 'boolean', description: 'Accepting intents.' } },
      { name: 'limit', flags: '--limit <value>', description: 'Maximum deposits to return.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('v1/deposits', context.config.marketBaseUrl), {
        depositor: input.depositor as string | undefined,
        delegate: input.delegate as string | undefined,
        platform: parseCsv(input.platform as string | undefined)?.join(','),
        currency: parseCsv(input.currency as string | undefined)?.join(','),
        status: input.status as string | undefined,
        accepting: input.accepting ? 'true' : undefined,
        limit: ensureNumber(input.limit ?? 50, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'intents'],
    description: 'Query intents from Peerlytics with filtering.',
    readOnly: true,
    options: [
      { name: 'owner', flags: '--owner <address>', description: 'Filter by intent owner address.', schema: { type: 'string', description: 'Owner address.' } },
      { name: 'recipient', flags: '--recipient <address>', description: 'Filter by recipient address.', schema: { type: 'string', description: 'Recipient address.' } },
      { name: 'depositId', flags: '--deposit-id <value>', description: 'Comma-separated deposit IDs.', schema: { type: 'string', description: 'Deposit IDs.' } },
      { name: 'status', flags: '--status <value>', description: 'Comma-separated statuses (FULFILLED, COMPLETED, PRUNED, SIGNALED, EXPIRED).', schema: { type: 'string', description: 'Intent statuses.' } },
      { name: 'limit', flags: '--limit <value>', description: 'Maximum intents to return.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 50 },
      { name: 'offset', flags: '--offset <value>', description: 'Pagination offset.', schema: { type: 'number', description: 'Offset.' }, defaultValue: 0 },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('v1/intents', context.config.marketBaseUrl), {
        owner: input.owner as string | undefined,
        recipient: input.recipient as string | undefined,
        depositId: input.depositId as string | undefined,
        status: input.status as string | undefined,
        limit: ensureNumber(input.limit ?? 50, 'limit'),
        offset: ensureNumber(input.offset ?? 0, 'offset'),
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'activity'],
    description: 'Fetch recent protocol activity from Peerlytics.',
    readOnly: true,
    options: [
      { name: 'type', flags: '--type <value>', description: 'Comma-separated event types (intent_signaled, intent_fulfilled, deposit_created, etc.).', schema: { type: 'string', description: 'Event types.' } },
      { name: 'limit', flags: '--limit <value>', description: 'Maximum events.', schema: { type: 'number', description: 'Result limit.' }, defaultValue: 100 },
      { name: 'since', flags: '--since <value>', description: 'Unix timestamp or ISO date to start from.', schema: { type: 'string', description: 'Start timestamp.' } },
    ],
    handler: async (input, context) => {
      const url = appendSearchParams(new URL('v1/activity', context.config.marketBaseUrl), {
        type: input.type as string | undefined,
        limit: ensureNumber(input.limit ?? 100, 'limit'),
        since: input.since as string | undefined,
      });
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },

  // --- History ---

  {
    path: ['market', 'taker-history'],
    description: 'Fetch taker activity history for an address from Peerlytics.',
    readOnly: true,
    args: [
      { name: 'address', description: 'Taker wallet address.', schema: { type: 'string', description: 'Taker address.' } },
    ],
    handler: async (input, context) => {
      const address = ensureAddress(input.address, 'address');
      const url = new URL(`v1/takers/${address}/history`, context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'maker-history'],
    description: 'Fetch maker activity history for an address from Peerlytics.',
    readOnly: true,
    args: [
      { name: 'address', description: 'Maker wallet address.', schema: { type: 'string', description: 'Maker address.' } },
    ],
    handler: async (input, context) => {
      const address = ensureAddress(input.address, 'address');
      const url = new URL(`v1/makers/${address}/history`, context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },

  // --- Meta ---

  {
    path: ['market', 'meta', 'platforms'],
    description: 'List supported payment platforms from Peerlytics with method hashes.',
    readOnly: true,
    handler: async (_input, context) => {
      const url = new URL('v1/meta/platforms', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'meta', 'currencies'],
    description: 'List supported currencies from Peerlytics.',
    readOnly: true,
    handler: async (_input, context) => {
      const url = new URL('v1/meta/currencies', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },

  // --- API key management ---

  {
    path: ['market', 'api-key', 'list'],
    description: 'List Peerlytics API keys for the authenticated account.',
    readOnly: true,
    handler: async (_input, context) => {
      if (!context.config.marketApiKey) {
        throw createError('AUTH_REQUIRED', 'Provide --market-api-key or set marketApiKey in config to manage API keys.');
      }
      const url = new URL('v1/account/keys', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
  {
    path: ['market', 'api-key', 'create'],
    description: 'Create a new Peerlytics API key.',
    readOnly: false,
    options: [
      { name: 'label', flags: '--label <value>', description: 'Optional label for the new key.', schema: { type: 'string', description: 'Key label.' } },
    ],
    handler: async (input, context) => {
      if (!context.config.marketApiKey) {
        throw createError('AUTH_REQUIRED', 'Provide --market-api-key or set marketApiKey in config to create API keys.');
      }
      const url = new URL('v1/account/keys', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        method: 'POST',
        headers: { ...marketHeaders(context.config.marketApiKey), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', label: input.label as string | undefined }),
      });
    },
  },
  {
    path: ['market', 'api-key', 'rotate'],
    description: 'Rotate an existing Peerlytics API key.',
    readOnly: false,
    args: [
      { name: 'key', description: 'The API key to rotate.', schema: { type: 'string', description: 'API key to rotate.' } },
    ],
    handler: async (input, context) => {
      if (!context.config.marketApiKey) {
        throw createError('AUTH_REQUIRED', 'Provide --market-api-key or set marketApiKey in config to rotate API keys.');
      }
      const key = ensureString(input.key, 'key');
      const url = new URL('v1/account/keys', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        method: 'POST',
        headers: { ...marketHeaders(context.config.marketApiKey), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rotate', key }),
      });
    },
  },
  {
    path: ['market', 'api-key', 'delete'],
    description: 'Delete a Peerlytics API key.',
    readOnly: false,
    dangerous: true,
    args: [
      { name: 'key', description: 'The API key to delete.', schema: { type: 'string', description: 'API key to delete.' } },
    ],
    handler: async (input, context) => {
      if (!context.config.marketApiKey) {
        throw createError('AUTH_REQUIRED', 'Provide --market-api-key or set marketApiKey in config to delete API keys.');
      }
      const key = ensureString(input.key, 'key');
      const url = new URL('v1/account/keys', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        method: 'POST',
        headers: { ...marketHeaders(context.config.marketApiKey), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', key }),
      });
    },
  },
  {
    path: ['market', 'credits'],
    description: 'Check Peerlytics API credit balance and usage.',
    readOnly: true,
    handler: async (_input, context) => {
      if (!context.config.marketApiKey) {
        throw createError('AUTH_REQUIRED', 'Provide --market-api-key or set marketApiKey in config to check credits.');
      }
      const url = new URL('v1/account/credits', context.config.marketBaseUrl);
      return context.requestJson(url.toString(), {
        headers: marketHeaders(context.config.marketApiKey),
      });
    },
  },
];
