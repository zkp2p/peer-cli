import type { Zkp2pClient, Zkp2pClientOptions } from '@zkp2p/sdk';
import { base } from 'viem/chains';
import { createWalletClient, http } from 'viem';
import { DEFAULT_CHAIN_ID } from '../utils/constants.js';
import { logDebug } from '../utils/logger.js';
import { resolveAccount } from './wallet.js';
import type { ResolvedConfig } from './config.js';

export interface ClientBundle {
  client: Zkp2pClient;
  publicClient: Zkp2pClient['publicClient'];
  walletClient: Zkp2pClient['walletClient'];
}

export async function createClient(config: ResolvedConfig, options: { requireWallet?: boolean } = {}): Promise<ClientBundle> {
  const { Zkp2pClient, setLogLevel } = await import('@zkp2p/sdk');
  setLogLevel(config.debug ? 'debug' : 'error');
  const account = await resolveAccount(config, Boolean(options.requireWallet));
  logDebug('Creating SDK client', {
    env: config.env,
    requireWallet: Boolean(options.requireWallet),
    rpcUrl: config.rpcUrl,
    accountAddress: account.address,
    hasApiKey: Boolean(config.apiKey),
    hasIndexerKey: Boolean(config.indexerKey),
  });
  const transport = http(config.rpcUrl);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport,
  });

  const sdkOptions: Zkp2pClientOptions = {
    walletClient: walletClient as unknown as Zkp2pClientOptions['walletClient'],
    chainId: DEFAULT_CHAIN_ID,
    runtimeEnv: config.env,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    ...(config.indexerKey ? { indexerApiKey: config.indexerKey } : {}),
    ...(config.indexerUrl ? { indexerUrl: config.indexerUrl } : {}),
    ...(config.baseApiUrl ? { baseApiUrl: config.baseApiUrl } : {}),
  };

  const client = new Zkp2pClient(sdkOptions);
  logDebug('SDK client ready', {
    env: config.env,
    chainId: DEFAULT_CHAIN_ID,
    accountAddress: account.address,
  });
  return {
    client,
    publicClient: client.publicClient,
    walletClient: client.walletClient,
  };
}
