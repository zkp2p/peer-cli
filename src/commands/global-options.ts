export interface GlobalOptionDefinition {
  flags: string;
  description: string;
  defaultValue?: string;
}

/**
 * Program-level options registered on the root `peer` command. Kept as data so
 * `src/cli.ts` and the shell-completion generator describe the exact same set
 * without a hand-maintained second list.
 */
export const GLOBAL_OPTIONS: GlobalOptionDefinition[] = [
  { flags: '--env <value>', description: 'Runtime environment (production, preproduction, or staging).' },
  {
    flags: '--private-key <hex>',
    description: 'Hex-encoded private key. Warning: visible in process listings. Prefer PEER_PRIVATE_KEY.',
  },
  { flags: '--wallet-path <path>', description: 'Path to a file containing a private key.' },
  { flags: '--rpc-url <url>', description: 'Override the Base RPC URL.' },
  { flags: '--api-key <value>', description: 'Curator API key for SDK-backed authenticated routes.' },
  { flags: '--indexer-key <value>', description: 'Indexer API key.' },
  { flags: '--indexer-url <url>', description: 'Indexer base URL override.' },
  { flags: '--market-api-key <value>', description: 'Peerlytics API key.' },
  { flags: '--pay-api-key <value>', description: 'Pay API key.' },
  { flags: '--base-api-url <url>', description: 'Base API URL override for SDK services.' },
  { flags: '--market-base-url <url>', description: 'Peerlytics base URL override.' },
  { flags: '--pay-base-url <url>', description: 'Pay API base URL override.' },
  { flags: '--format <value>', description: 'Output format: json or table.', defaultValue: 'json' },
  { flags: '--yes', description: 'Skip dry-run previews and execute immediately.' },
  { flags: '--debug', description: 'Enable verbose debug logging.' },
];

/** Long flag token for an option, e.g. `--format` from `--format <value>`. */
export function globalOptionFlag(option: GlobalOptionDefinition): string {
  return option.flags.split(' ', 1)[0]!;
}

/** Global flags that consume the next argv token as their value. */
export const GLOBAL_OPTIONS_WITH_VALUES: ReadonlySet<string> = new Set(
  GLOBAL_OPTIONS.filter((option) => /[<[]/.test(option.flags)).map(globalOptionFlag),
);
