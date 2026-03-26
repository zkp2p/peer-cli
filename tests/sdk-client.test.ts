import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  setLogLevel: vi.fn(),
  createWalletClient: vi.fn(() => ({ kind: 'wallet-client' })),
  http: vi.fn(() => ({ kind: 'transport' })),
  resolveAccount: vi.fn(async () => ({ address: '0x1234567890123456789012345678901234567890' })),
  zkp2pClient: vi.fn().mockImplementation(() => ({
    publicClient: { kind: 'public-client' },
    walletClient: { kind: 'wallet-client-from-sdk' },
  })),
}));

vi.mock('@zkp2p/sdk', () => ({
  Zkp2pClient: mocks.zkp2pClient,
  setLogLevel: mocks.setLogLevel,
}));

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem');
  return {
    ...actual,
    createWalletClient: mocks.createWalletClient,
    http: mocks.http,
  };
});

vi.mock('../src/sdk/wallet.js', () => ({
  resolveAccount: mocks.resolveAccount,
}));

import { createClient } from '../src/sdk/client.js';

describe('createClient', () => {
  it('creates an authenticated sdk client bundle', async () => {
    const bundle = await createClient(
      {
        env: 'production',
        format: 'json',
        yes: false,
        debug: true,
        privateKey: '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e',
        rpcUrl: 'https://rpc.example',
        apiKey: 'api',
        indexerKey: 'indexer',
        indexerUrl: 'https://indexer.example',
        baseApiUrl: 'https://base.example',
      },
      { requireWallet: true },
    );

    expect(mocks.setLogLevel).toHaveBeenCalledWith('debug');
    expect(mocks.resolveAccount).toHaveBeenCalledWith(expect.objectContaining({ rpcUrl: 'https://rpc.example' }), true);
    expect(mocks.http).toHaveBeenCalledWith('https://rpc.example');
    expect(mocks.createWalletClient).toHaveBeenCalledWith(
      expect.objectContaining({
        account: { address: '0x1234567890123456789012345678901234567890' },
      }),
    );
    expect(mocks.zkp2pClient).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 8453,
        runtimeEnv: 'production',
        apiKey: 'api',
        indexerApiKey: 'indexer',
        indexerUrl: 'https://indexer.example',
        baseApiUrl: 'https://base.example',
      }),
    );
    expect(bundle).toEqual({
      client: expect.any(Object),
      publicClient: { kind: 'public-client' },
      walletClient: { kind: 'wallet-client-from-sdk' },
    });
  });

  it('resolves without a wallet when not required', async () => {
    mocks.setLogLevel.mockClear();
    mocks.resolveAccount.mockClear();
    await createClient(
      {
        env: 'staging',
        format: 'json',
        yes: false,
        debug: false,
        rpcUrl: 'https://rpc.example',
      },
      { requireWallet: false },
    );

    expect(mocks.setLogLevel).toHaveBeenCalledWith('error');
    expect(mocks.resolveAccount).toHaveBeenCalledWith(expect.any(Object), false);
  });
});
