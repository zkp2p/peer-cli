import { readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { createError } from '../output/errors.js';
import { DUMMY_PRIVATE_KEY } from '../utils/constants.js';
import { ensureHexPrivateKey } from '../utils/validation.js';
import type { ResolvedConfig } from './config.js';

async function readPrivateKeyFromWalletPath(path: string): Promise<`0x${string}`> {
  const raw = (await readFile(path, 'utf8')).trim();

  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as { privateKey?: string };
    if (parsed.privateKey) {
      return ensureHexPrivateKey(parsed.privateKey);
    }
  }

  return ensureHexPrivateKey(raw);
}

export async function resolvePrivateKey(config: ResolvedConfig, requireWallet: boolean): Promise<`0x${string}`> {
  if (config.privateKey) {
    return ensureHexPrivateKey(config.privateKey);
  }

  if (config.walletPath) {
    return readPrivateKeyFromWalletPath(config.walletPath);
  }

  if (requireWallet) {
    throw createError('AUTH_REQUIRED', 'This command requires a signer. Provide --private-key, PEER_PRIVATE_KEY, or config walletPath.');
  }

  return DUMMY_PRIVATE_KEY;
}

export async function resolveAccount(config: ResolvedConfig, requireWallet: boolean) {
  const privateKey = await resolvePrivateKey(config, requireWallet);
  return privateKeyToAccount(privateKey);
}
