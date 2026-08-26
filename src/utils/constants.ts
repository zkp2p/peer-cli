export const DEFAULT_CHAIN_ID = 8453;
export const DEFAULT_CHAIN_NAME = 'base';
export const DEFAULT_RPC_URL = 'https://mainnet.base.org';
export const DEFAULT_BASE_API_URLS = {
  production: 'https://api.zkp2p.xyz',
  preproduction: 'https://api-preprod.zkp2p.xyz',
  staging: 'https://api-staging.zkp2p.xyz',
} as const;
export const DEFAULT_PAY_API_URL = 'https://api.pay.zkp2p.xyz';
export const DEFAULT_MARKET_API_URL = 'https://peerlytics.xyz/api/';
export const PEER_CONFIG_DIR = '.peer';
export const PEER_CONFIG_FILE = 'config.json';
export const PEER_CHECKOUT_CACHE_FILE = 'checkout-sessions.json';
export const SUPPORTED_ENVS = ['production', 'preproduction', 'staging'] as const;
export const SUPPORTED_FORMATS = ['json', 'table'] as const;
export const SUPPORTED_MARKET_PERIODS = ['mtd', '3mtd', 'ytd', 'all'] as const;
export const SUPPORTED_CURRENCIES = [
  'AED', 'ARS', 'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR',
  'ILS', 'INR', 'JPY', 'KES', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SAR', 'SEK', 'SGD',
  'THB', 'TRY', 'UGX', 'USD', 'VND', 'ZAR',
] as const;
export const SUPPORTED_PLATFORMS = [
  'wise', 'venmo', 'revolut', 'cashapp', 'mercadopago', 'zelle', 'paypal', 'monzo', 'alipay', 'chime',
] as const;
export const LEGACY_PLATFORMS = ['luxon', 'n26'] as const;
export const KNOWN_PLATFORMS = [...SUPPORTED_PLATFORMS, ...LEGACY_PLATFORMS] as const;
export const DUMMY_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945383f0d7d1f5eb53d3d16c23f0a3077ec12e' as const;
