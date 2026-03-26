import type { CommandDefinition } from './framework.js';
import { quoteDefinitions } from './quote.js';
import { takerDefinitions } from './taker.js';
import { depositDefinitions } from './deposit.js';
import { intentDefinitions } from './intent.js';
import { vaultDefinitions } from './vault.js';
import { delegateDefinitions } from './delegate.js';
import { marketDefinitions } from './market.js';
import { transferDefinitions } from './transfer.js';
import { checkoutDefinitions } from './checkout.js';
import { configDefinitions } from './config.js';
import { mcpDefinitions } from './mcp.js';

export const commandDefinitions: CommandDefinition[] = [
  ...quoteDefinitions,
  ...takerDefinitions,
  ...depositDefinitions,
  ...intentDefinitions,
  ...vaultDefinitions,
  ...delegateDefinitions,
  ...marketDefinitions,
  ...transferDefinitions,
  ...checkoutDefinitions,
  ...configDefinitions,
  ...mcpDefinitions,
];
