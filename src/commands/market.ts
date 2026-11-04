import type { CommandDefinition } from './framework.js';
import { sdkReadHandler } from './helpers.js';
import { createError } from '../output/errors.js';
import { DEFAULT_CHAIN_ID, SUPPORTED_PLATFORMS } from '../utils/constants.js';
import {
  amountToUnits,
  ensureAddress,
  ensureNumber,
  ensureSupportedCurrency,
  ensureSupportedPlatformList,
  parseCsv,
} from '../utils/validation.js';

const FIAT_AMOUNT_DECIMALS = 6;

export const marketDefinitions: CommandDefinition[] = [
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
];
