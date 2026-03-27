import { readFile } from 'node:fs/promises';
import { privateKeyToAccount } from 'viem/accounts';
import { createError } from '../output/errors.js';
import { DUMMY_PRIVATE_KEY } from '../utils/constants.js';
import { logDebug } from '../utils/logger.js';
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
    logDebug('Resolved wallet from inline private key input', { requireWallet });
    return ensureHexPrivateKey(config.privateKey);
  }

  if (config.walletPath) {
    logDebug('Resolved wallet from wallet path', { requireWallet, walletPath: config.walletPath });
    return readPrivateKeyFromWalletPath(config.walletPath);
  }

  if (requireWallet) {
    logDebug('Wallet resolution failed because no signer material was configured', { requireWallet });
    throw createError('AUTH_REQUIRED', 'This command requires a signer. Provide --private-key, PEER_PRIVATE_KEY, or config walletPath.');
  }

  logDebug('Using dummy account because wallet is optional and no signer was configured');
  return DUMMY_PRIVATE_KEY;
}

export async function resolveAccount(config: ResolvedConfig, requireWallet: boolean) {
  const privateKey = await resolvePrivateKey(config, requireWallet);
  const account = privateKeyToAccount(privateKey);
  logDebug('Resolved wallet account', { requireWallet, address: account.address });
  return account;
}
