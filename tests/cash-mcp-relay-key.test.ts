import { afterEach, describe, expect, it, vi } from 'vitest';

const createPeer = vi.fn((_options: Record<string, unknown>) => ({ sell: {} }));
vi.mock('@zkp2p/sdk', () => ({ createPeer }));

const { registerPeerCashTools } = await import('../src/mcp/cash.js');

afterEach(() => {
  createPeer.mockClear();
  delete process.env.PEER_CASH_RELAY_API_KEY;
});

// Relay's quote endpoint requires an API key, so the source tools need one.
describe('Relay API key for the source tools', () => {
  it('passes PEER_CASH_RELAY_API_KEY to the SDK as relay.apiKey', () => {
    process.env.PEER_CASH_RELAY_API_KEY = 'relay-test-key';
    registerPeerCashTools({ registerTool: vi.fn() } as never, { config: { environment: 'staging' }, includeWrites: false });
    expect(createPeer).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'staging', relay: { apiKey: 'relay-test-key' } }),
    );
  });

  it('sends no relay options without a key', () => {
    registerPeerCashTools({ registerTool: vi.fn() } as never, { config: { environment: 'staging' }, includeWrites: false });
    expect(createPeer.mock.calls[0]![0]).not.toHaveProperty('relay');
  });
});
