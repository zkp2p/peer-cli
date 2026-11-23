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

  it('answers quote_source without a key with a non-retryable error naming the env var', async () => {
    const registerTool = vi.fn();
    registerPeerCashTools({ registerTool } as never, { config: { environment: 'staging' }, includeWrites: false });
    const quote = registerTool.mock.calls.find(([name]) => name === 'peer_cash_quote_source')![2];
    const result = await quote({ user: `0x${'22'.repeat(20)}`, amount: '1', sourceChainId: 10, sourceCurrency: '0x0' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).error).toMatchObject({
      code: 'RELAY_API_KEY_REQUIRED',
      retryable: false,
    });
    expect(result.content[0].text).toContain('PEER_CASH_RELAY_API_KEY');
  });

  it('sends no relay options without a key', () => {
    registerPeerCashTools({ registerTool: vi.fn() } as never, { config: { environment: 'staging' }, includeWrites: false });
    expect(createPeer.mock.calls[0]![0]).not.toHaveProperty('relay');
  });
});
