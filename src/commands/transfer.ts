import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from 'viem';
import type { CommandDefinition } from './framework.js';
import { createError } from '../output/errors.js';
import { DEFAULT_CHAIN_ID } from '../utils/constants.js';
import { ensureAddress, ensurePositiveNumber } from '../utils/validation.js';

function resolveTokenAddress(inputToken: unknown, fallbackToken: string | undefined): `0x${string}` {
  if (inputToken) {
    return ensureAddress(inputToken, 'token');
  }
  if (fallbackToken) {
    return ensureAddress(fallbackToken, 'token');
  }
  throw createError('CONFIG_ERROR', 'USDC address is not available for the current runtime environment.');
}

async function readTokenDecimals(
  publicClient: Awaited<ReturnType<Parameters<CommandDefinition['handler']>[1]['getClient']>>['publicClient'],
  token: `0x${string}`,
): Promise<number> {
  return Number(
    await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'decimals',
    }),
  );
}

export const transferDefinitions: CommandDefinition[] = [
  {
    path: ['transfer'],
    description: 'Transfer USDC directly from the configured wallet.',
    readOnly: false,
    requireWallet: true,
    options: [
      { name: 'to', flags: '--to <address>', description: 'Recipient address.', schema: { type: 'string', description: 'Recipient address.' } },
      { name: 'amount', flags: '--amount <value>', description: 'Token amount in human units.', schema: { type: 'number', description: 'Token amount.' } },
      { name: 'token', flags: '--token <address>', description: 'Token address override.', schema: { type: 'string', description: 'ERC20 token address.' } },
    ],
    handler: async (input, context) => {
      const { client, walletClient, publicClient } = await context.getClient({ requireWallet: true });
      const token = resolveTokenAddress(input.token, client.getUsdcAddress());
      const to = ensureAddress(input.to, 'to');
      const decimals = await readTokenDecimals(publicClient, token);
      const amount = parseUnits(ensurePositiveNumber(input.amount, 'amount').toString(), decimals);
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to, amount],
      });

      const account = walletClient.account;
      if (!account) {
        throw createError('AUTH_REQUIRED', 'This command requires a signer account.');
      }

      return context.runPrepared({
        description: `Transfer ${input.amount} tokens to ${to}.`,
        prepare: async () => ({
          prepared: {
            to: token,
            data,
            value: 0n,
            chainId: DEFAULT_CHAIN_ID,
          },
        }),
        execute: async () =>
          walletClient.sendTransaction({
            account,
            chain: undefined,
            to: token,
            data,
            value: 0n,
          }),
      });
    },
  },
  {
    path: ['balance'],
    description: 'Read the current USDC balance for an address.',
    readOnly: true,
    options: [
      { name: 'address', flags: '--address <address>', description: 'Address to inspect.', schema: { type: 'string', description: 'Wallet address.' } },
      { name: 'token', flags: '--token <address>', description: 'Token address override.', schema: { type: 'string', description: 'ERC20 token address.' } },
    ],
    handler: async (input, context) => {
      const { client, walletClient, publicClient } = await context.getClient({ requireWallet: false });
      const address = input.address
        ? ensureAddress(input.address, 'address')
        : walletClient.account?.address;
      if (!address) {
        throw createError('AUTH_REQUIRED', 'Provide --address when no wallet is configured.');
      }

      const token = resolveTokenAddress(input.token, client.getUsdcAddress());
      const decimals = await readTokenDecimals(publicClient, token);
      const balance = await publicClient.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      });

      return {
        token,
        address,
        decimals,
        raw: balance.toString(),
        formatted: formatUnits(balance, decimals),
      };
    },
  },
];
