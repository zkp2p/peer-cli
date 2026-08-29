import type { CommandDefinition } from './framework.js';
import { COMPLETION_SHELLS, renderCompletionScript } from '../completion/index.js';
import { ensureOneOf } from '../utils/validation.js';

export const completionDefinitions: CommandDefinition[] = [
  {
    path: ['completion'],
    description: 'Print a shell completion script generated from the command registry.',
    readOnly: true,
    passthrough: true,
    exposeInMcp: false,
    args: [
      {
        name: 'shell',
        description: 'Target shell for the completion script.',
        schema: { type: 'string', description: 'Target shell.', enum: COMPLETION_SHELLS },
      },
    ],
    examples: [
      'peer completion bash > /etc/bash_completion.d/peer',
      'source <(peer completion zsh)',
      'peer completion fish | source',
    ],
    handler: async (input) => {
      const shell = ensureOneOf(input.shell, 'shell', COMPLETION_SHELLS);
      const { commandDefinitions } = await import('./registry.js');
      process.stdout.write(renderCompletionScript(shell, commandDefinitions));
      return { shell };
    },
  },
];
