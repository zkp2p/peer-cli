import type { CommandDefinition } from './framework.js';
import { quoteDefinitions } from './quote.js';
import { depositDefinitions } from './deposit.js';
import { intentDefinitions } from './intent.js';
import { vaultDefinitions } from './vault.js';
import { delegateDefinitions } from './delegate.js';
import { marketDefinitions } from './market.js';
import { transferDefinitions } from './transfer.js';
import { checkoutDefinitions } from './checkout.js';
import { configDefinitions } from './config.js';
import { mcpDefinitions } from './mcp.js';
import { guardianDefinitions, stakeDefinitions } from './stake.js';
import { completionDefinitions } from './completion.js';

export const commandDefinitions: CommandDefinition[] = [
  ...quoteDefinitions,
  ...depositDefinitions,
  ...intentDefinitions,
  ...vaultDefinitions,
  ...delegateDefinitions,
  ...marketDefinitions,
  ...transferDefinitions,
  ...checkoutDefinitions,
  ...configDefinitions,
  ...stakeDefinitions,
  ...guardianDefinitions,
  ...mcpDefinitions,
  ...completionDefinitions,
];
