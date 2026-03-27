import type { CommandDefinition } from './framework.js';
import { createError } from '../output/errors.js';
import { DEFAULT_CHAIN_ID } from '../utils/constants.js';
import { getCheckoutCachePath } from '../sdk/config.js';
import { ensureAddress, ensureNumber, ensurePositiveNumber, ensureString, parseCsv, parseJsonInput } from '../utils/validation.js';
import { appendSearchParams } from '../utils/http.js';

interface CheckoutCacheRecord {
  sessions: Record<string, unknown>;
}

interface PayEnvelope<T> {
  success?: boolean;
  message?: string;
  responseObject?: T;
  statusCode?: number;
}

interface PayMerchantProfile {
  id: string;
  defaultAddress?: string | null;
}

function payHeaders(apiKey?: string): Record<string, string> {
  return apiKey ? { 'x-api-key': apiKey } : {};
}

function unwrapPayEnvelope<T>(value: unknown): T {
  if (typeof value === 'object' && value !== null && 'responseObject' in value) {
    return (value as PayEnvelope<T>).responseObject as T;
  }
  return value as T;
}

function resolveCheckoutCacheKey(session: Record<string, unknown>): string | undefined {
  const orderId = session.orderId;
  if (typeof orderId === 'string' && orderId.length > 0) {
    return orderId;
  }

  const id = session.id;
  if (typeof id === 'string' && id.length > 0) {
    return id;
  }

  const nestedSession = session.session;
  if (typeof nestedSession === 'object' && nestedSession !== null) {
    const nestedId = (nestedSession as Record<string, unknown>).id;
    if (typeof nestedId === 'string' && nestedId.length > 0) {
      return nestedId;
    }
  }

  return undefined;
}

function normalizeMetadata(value: unknown, description: unknown): Record<string, string> | undefined {
  const rawMetadata = value
    ? parseJsonInput(ensureString(value, 'metadata'), 'metadata')
    : {};
  const metadata = Object.fromEntries(
    Object.entries(rawMetadata as Record<string, unknown>).map(([key, entry]) => [
      key,
      typeof entry === 'string' ? entry : JSON.stringify(entry),
    ]),
  );

  if (description) {
    metadata.description = ensureString(description, 'description');
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

async function readCheckoutCache(
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
): Promise<CheckoutCacheRecord> {
  try {
    const raw = await context.readTextFile(getCheckoutCachePath());
    return JSON.parse(raw) as CheckoutCacheRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { sessions: {} };
    }
    throw createError('CONFIG_ERROR', 'Failed to read checkout cache.', { details: error });
  }
}

async function upsertCheckoutCache(
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
  session: Record<string, unknown>,
): Promise<void> {
  const cache = await readCheckoutCache(context);
  const cacheKey = resolveCheckoutCacheKey(session);
  if (!cacheKey) {
    return;
  }
  cache.sessions[cacheKey] = session;
  await context.writeJsonFile(getCheckoutCachePath(), cache);
}

function requirePayApiKey(apiKey: string | undefined): string {
  if (!apiKey) {
    throw createError('AUTH_REQUIRED', 'Provide a Pay API key via --pay-api-key or PEER_PAY_API_KEY.');
  }
  return apiKey;
}

function normalizeCheckoutStatus(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const status = ensureString(value, 'status');
  const aliases: Record<string, string> = {
    pending: 'created',
    completed: 'fulfilled',
  };
  return aliases[status] ?? status;
}

async function resolvePayMerchant(
  context: Parameters<NonNullable<CommandDefinition['handler']>>[1],
  apiKey: string,
): Promise<PayMerchantProfile> {
  const response = await context.requestJson<PayEnvelope<PayMerchantProfile>>(
    new URL('/api/merchants/me', context.config.payBaseUrl).toString(),
    {
      headers: payHeaders(apiKey),
    },
  );
  return unwrapPayEnvelope<PayMerchantProfile>(response);
}

function buildApiMutationPreview(endpoint: string, payload: Record<string, unknown>) {
  return {
    prepared: {
      to: '0x0000000000000000000000000000000000000000' as `0x${string}`,
      data: '0x' as `0x${string}`,
      value: 0n,
      chainId: DEFAULT_CHAIN_ID,
    },
    previewData: {
      endpoint,
      payload,
    },
  };
}

export const checkoutDefinitions: CommandDefinition[] = [
  {
    path: ['checkout', 'create'],
    description: 'Create a hosted Pay checkout session and cache the response locally.',
    readOnly: false,
    options: [
      { name: 'amount', flags: '--amount <value>', description: 'USDC amount to collect.', schema: { type: 'number', description: 'USDC amount.' } },
      { name: 'currency', flags: '--currency <code>', description: 'Fiat currency restriction.', schema: { type: 'string', description: 'Fiat currency.' }, defaultValue: 'USD' },
      { name: 'description', flags: '--description <value>', description: 'Human-readable order description.', schema: { type: 'string', description: 'Order description.' } },
      { name: 'merchantId', flags: '--merchant-id <value>', description: 'Merchant identifier override.', schema: { type: 'string', description: 'Merchant ID.' } },
      { name: 'recipient', flags: '--recipient <address>', description: 'Recipient wallet address.', schema: { type: 'string', description: 'Recipient address.' } },
      { name: 'platforms', flags: '--platforms <csv>', description: 'Comma-separated allowed payment platforms.', schema: { type: 'string', description: 'Payment platforms.' } },
      { name: 'metadata', flags: '--metadata <json>', description: 'Metadata object as JSON.', schema: { type: 'object', description: 'Metadata object.' } },
      { name: 'callbackUrl', flags: '--callback-url <url>', description: 'Optional redirect URL after completion.', schema: { type: 'string', description: 'Callback URL.' } },
      { name: 'token', flags: '--token <address>', description: 'Destination token override.', schema: { type: 'string', description: 'Destination token.' } },
      { name: 'chainId', flags: '--chain-id <id>', description: 'Destination chain ID.', schema: { type: 'number', description: 'Destination chain ID.' }, defaultValue: DEFAULT_CHAIN_ID },
    ],
    handler: async (input, context) => {
      const apiKey = requirePayApiKey(context.config.payApiKey);
      const { client, walletClient } = await context.getClient({ requireWallet: false });
      const merchant = !input.merchantId || !input.recipient
        ? await resolvePayMerchant(context, apiKey)
        : undefined;
      const recipient = input.recipient
        ? ensureAddress(input.recipient, 'recipient')
        : walletClient.account?.address ?? merchant?.defaultAddress ?? undefined;
      if (!recipient) {
        throw createError('AUTH_REQUIRED', 'Provide --recipient when no wallet is configured.');
      }

      const metadata = normalizeMetadata(input.metadata, input.description);
      const paymentPlatforms = parseCsv(input.platforms as string | undefined);
      const payload = {
        merchantId: input.merchantId ? ensureString(input.merchantId, 'merchantId') : ensureString(merchant?.id, 'merchantId'),
        amountUsdc: ensurePositiveNumber(input.amount, 'amount').toFixed(2),
        destinationChainId: ensureNumber(input.chainId ?? DEFAULT_CHAIN_ID, 'chainId'),
        destinationToken: input.token ? ensureAddress(input.token, 'token') : ensureAddress(client.getUsdcAddress(), 'token'),
        recipientAddress: recipient,
        ...(paymentPlatforms ? { enabledPaymentPlatforms: paymentPlatforms } : {}),
        ...(metadata ? { metadata } : {}),
        ...(input.callbackUrl ? { successUrl: ensureString(input.callbackUrl, 'callbackUrl') } : {}),
      };
      const endpoint = new URL('/api/checkout/sessions', context.config.payBaseUrl).toString();

      return context.runPrepared({
        description: `Create a checkout session for ${payload.amountUsdc} USDC.`,
        prepare: async () => buildApiMutationPreview(endpoint, payload),
        execute: async () => {
          const response = await context.requestJson<PayEnvelope<Record<string, unknown>>>(endpoint, {
            method: 'POST',
            headers: payHeaders(apiKey),
            body: JSON.stringify(payload),
          });
          const session = unwrapPayEnvelope<Record<string, unknown>>(response);
          const cacheSession = typeof session.session === 'object' && session.session !== null
            ? session.session as Record<string, unknown>
            : session;
          await upsertCheckoutCache(context, cacheSession);
          return session;
        },
      });
    },
  },
  {
    path: ['checkout', 'list'],
    description: 'List checkout sessions from the Pay API, with a local cache fallback.',
    readOnly: true,
    options: [
      { name: 'status', flags: '--status <value>', description: 'Status filter. Aliases: pending -> created, completed -> fulfilled.', schema: { type: 'string', description: 'Status filter.' } },
      { name: 'page', flags: '--page <value>', description: 'Page number.', schema: { type: 'number', description: 'Page number.' }, defaultValue: 1 },
      { name: 'pageSize', flags: '--page-size <value>', description: 'Page size.', schema: { type: 'number', description: 'Page size.' }, defaultValue: 25 },
    ],
    handler: async (input, context) => {
      const status = normalizeCheckoutStatus(input.status);
      if (!context.config.payApiKey) {
        const cache = await readCheckoutCache(context);
        const sessions = Object.values(cache.sessions).filter((item) => {
          if (!status || typeof item !== 'object' || item === null) return true;
          const record = item as Record<string, unknown>;
          const currentStatus = typeof record.status === 'string' ? record.status.toLowerCase() : record.status;
          const currentState = typeof record.state === 'string' ? record.state.toLowerCase() : record.state;
          return currentStatus === status || currentState === status;
        });
        return {
          source: 'cache',
          sessions,
        };
      }

      const url = appendSearchParams(new URL('/api/merchants/me/sessions', context.config.payBaseUrl), {
        status,
        page: ensureNumber(input.page ?? 1, 'page'),
        limit: ensureNumber(input.pageSize ?? 25, 'pageSize'),
      });
      const response = await context.requestJson<PayEnvelope<Record<string, unknown>>>(url.toString(), {
        headers: payHeaders(context.config.payApiKey),
      });
      return unwrapPayEnvelope<Record<string, unknown>>(response);
    },
  },
  {
    path: ['checkout', 'show'],
    description: 'Show a single checkout session or poll its latest status.',
    readOnly: true,
    args: [{ name: 'sessionId', description: 'Checkout session / order ID.', schema: { type: 'string', description: 'Session identifier.' } }],
    handler: async (input, context) => {
      const sessionId = ensureString(input.sessionId, 'sessionId');
      if (!context.config.payApiKey) {
        const cache = await readCheckoutCache(context);
        const session = cache.sessions[sessionId];
        if (session) {
          return {
            source: 'cache',
            session,
          };
        }
        throw createError('AUTH_REQUIRED', 'Provide a Pay API key or create the session locally first so it exists in cache.');
      }

      const session = await context.requestJson<Record<string, unknown>>(
        new URL(`/v1/checkout/session/${sessionId}`, context.config.payBaseUrl).toString(),
        {
          headers: payHeaders(context.config.payApiKey),
        },
      );
      await upsertCheckoutCache(context, { ...session, orderId: session.orderId ?? sessionId });
      return session;
    },
  },
  {
    path: ['checkout', 'cancel'],
    description: 'Cancel an active checkout session.',
    readOnly: false,
    args: [{ name: 'sessionId', description: 'Checkout session / order ID.', schema: { type: 'string', description: 'Session identifier.' } }],
    handler: async (input, context) => {
      const sessionId = ensureString(input.sessionId, 'sessionId');
      const apiKey = requirePayApiKey(context.config.payApiKey);
      const endpoint = new URL(`/v1/checkout/session/${sessionId}/cancel`, context.config.payBaseUrl).toString();

      return context.runPrepared({
        description: `Cancel checkout session ${sessionId}.`,
        prepare: async () => buildApiMutationPreview(endpoint, { sessionId }),
        execute: async () => {
          const response = await context.requestJson<Record<string, unknown>>(endpoint, {
            method: 'POST',
            headers: payHeaders(apiKey),
            body: JSON.stringify({}),
          });
          await upsertCheckoutCache(context, { ...response, orderId: response.orderId ?? sessionId });
          return response;
        },
      });
    },
  },
];
