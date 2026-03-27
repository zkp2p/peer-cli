import type { CommandDefinition } from './framework.js';
import { createError } from '../output/errors.js';
import { DEFAULT_CHAIN_ID } from '../utils/constants.js';
import { ensureAddress, ensureNumber } from '../utils/validation.js';

export const takerDefinitions: CommandDefinition[] = [
  {
    path: ['taker', 'tier'],
    description: 'Fetch taker caps and cooldown state for an address.',
    readOnly: true,
    options: [
      { name: 'address', flags: '--address <address>', description: 'Taker wallet address.', schema: { type: 'string', description: 'Taker wallet address.' } },
      { name: 'chainId', flags: '--chain-id <id>', description: 'Chain ID to evaluate.', schema: { type: 'number', description: 'Chain ID.' }, defaultValue: DEFAULT_CHAIN_ID },
    ],
    handler: async (input, context) => {
      const { client, walletClient } = await context.getClient({ requireWallet: false });
      const address = input.address ? ensureAddress(input.address, 'address') : walletClient.account?.address;
      if (!address) {
        throw createError('AUTH_REQUIRED', 'Provide --address when no wallet is configured.');
      }

      return client.getTakerTier({
        owner: address,
        chainId: ensureNumber(input.chainId ?? DEFAULT_CHAIN_ID, 'chainId'),
      });
    },
  },
];
