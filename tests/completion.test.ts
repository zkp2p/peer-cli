import { describe, expect, it, vi } from 'vitest';
import { runCliInProcess } from './helpers/cli-runner.js';
import { createMockRuntime } from './helpers/mock-runtime.js';
import type { CommandDefinition } from '../src/commands/framework.js';
import { createProgram } from '../src/cli.js';
import {
  GLOBAL_OPTIONS,
  GLOBAL_OPTIONS_WITH_VALUES,
  globalOptionFlag,
} from '../src/commands/global-options.js';
import {
  COMPLETION_SHELLS,
  buildCompletionModel,
  renderCompletionScript,
} from '../src/completion/index.js';
import { completionDefinitions } from '../src/commands/completion.js';
import { commandDefinitions } from '../src/commands/registry.js';

const noop = async (): Promise<unknown> => undefined;

const fixtures: CommandDefinition[] = [
  { path: [], description: 'root sentinel', readOnly: true, handler: noop },
  {
    path: ['quote'],
    description: 'Get a quote: fast route',
    readOnly: true,
    options: [
      { name: 'from', flags: '--from <currency>', description: 'Source currency', schema: { type: 'string', description: 'x' } },
      { name: 'y', flags: '-y', description: 'Short-only flag with no long form', schema: { type: 'boolean', description: 'x' } },
    ],
    handler: noop,
  },
  {
    path: ['deposit', 'create'],
    description: 'Create   a\tdeposit',
    readOnly: false,
    args: [
      { name: 'id', description: 'Deposit id', schema: { type: 'string', description: 'x' }, optionFlags: ['--id <value>'] },
    ],
    handler: noop,
  },
];

describe('global-options', () => {
  it('reduces a flags string to its long token', () => {
    expect(globalOptionFlag({ flags: '--format <value>', description: '' })).toBe('--format');
    expect(globalOptionFlag({ flags: '--yes', description: '' })).toBe('--yes');
  });

  it('marks only value-taking global flags as consuming the next token', () => {
    expect(GLOBAL_OPTIONS_WITH_VALUES.has('--format')).toBe(true);
    expect(GLOBAL_OPTIONS_WITH_VALUES.has('--env')).toBe(true);
    expect(GLOBAL_OPTIONS_WITH_VALUES.has('--yes')).toBe(false);
    expect(GLOBAL_OPTIONS_WITH_VALUES.has('--debug')).toBe(false);
  });

  it('stays the single source of truth for the flags the program registers', async () => {
    const program = await createProgram();
    const registered = new Set(program.options.map((option) => option.long));
    for (const option of GLOBAL_OPTIONS) {
      expect(registered.has(globalOptionFlag(option))).toBe(true);
    }
  });
});

describe('buildCompletionModel', () => {
  const model = buildCompletionModel(fixtures);
  const byKey = (key: string) => model.find((node) => node.path.join(' ') === key);

  it('skips a zero-length path but keeps a root node with globals and top-level children', () => {
    const root = byKey('');
    expect(root).toBeDefined();
    expect(root!.children).toEqual(['deposit', 'quote']);
    expect(root!.options).toContain('--version');
    expect(root!.options).toContain('--help');
    for (const option of GLOBAL_OPTIONS) {
      expect(root!.options).toContain(globalOptionFlag(option));
    }
  });

  it('synthesises a parent group with no description and only --help', () => {
    const group = byKey('deposit');
    expect(group).toBeDefined();
    expect(group!.description).toBe('');
    expect(group!.children).toEqual(['create']);
    expect(group!.options).toEqual(['--help']);
  });

  it('collects leaf options from flags, positional aliases, and the implicit framework flags', () => {
    const leaf = byKey('deposit create');
    expect(leaf!.options).toEqual(['--help', '--id', '--params', '--params-file']);
  });

  it('drops flags that have no long form', () => {
    const leaf = byKey('quote');
    expect(leaf!.options).toContain('--from');
    expect(leaf!.options).not.toContain('-y');
  });

  it('normalises descriptions to a single colon-free line', () => {
    expect(byKey('quote')!.description).toBe('Get a quote - fast route');
    expect(byKey('deposit create')!.description).toBe('Create a deposit');
  });
});

describe('renderCompletionScript', () => {
  it('emits a loadable bash function keyed on the command path', () => {
    const script = renderCompletionScript('bash', fixtures);
    expect(script).toContain('complete -F _peer peer');
    expect(script).toContain('case "${path}" in');
    expect(script).toContain('    "") opts=');
    expect(script).toContain('"deposit create") opts="--help --id --params --params-file"');
    expect(script).toMatch(/"\) opts="[^"]*\bdeposit\b/);
  });

  it('emits a zsh #compdef script with descriptions', () => {
    const script = renderCompletionScript('zsh', fixtures);
    expect(script.startsWith('#compdef peer')).toBe(true);
    expect(script).toContain("_describe -t commands 'peer' entries");
    expect(script).toContain("'quote:Get a quote - fast route'");
    expect(script).toContain('    "") entries=(');
  });

  it('emits declarative fish complete lines behind a path-precise guard', () => {
    const script = renderCompletionScript('fish', fixtures);
    expect(script).toContain('function __fish_peer_path');
    expect(script).toContain('complete -c peer -f');
    expect(script).toContain('complete -c peer -n \'test -z (__fish_peer_path)\' -a "quote" -d "Get a quote - fast route"');
    expect(script).toContain('complete -c peer -n \'__fish_peer_at "deposit"\' -a "create" -d "Create a deposit"');
    expect(script).toContain('complete -c peer -n \'__fish_peer_at "deposit create"\' -l id');
  });

  it('covers every advertised shell against the real registry', () => {
    for (const shell of COMPLETION_SHELLS) {
      const script = renderCompletionScript(shell, commandDefinitions);
      expect(script.length).toBeGreaterThan(0);
      expect(script).toContain('quote');
      expect(script).toContain('deposit create');
      expect(script).toContain('completion');
    }
  });
});

describe('peer completion command', () => {
  it('is registered, read-only, and hidden from the MCP surface', () => {
    const definition = completionDefinitions[0]!;
    expect(definition.path).toEqual(['completion']);
    expect(definition.readOnly).toBe(true);
    expect(definition.passthrough).toBe(true);
    expect(definition.exposeInMcp).toBe(false);
    expect(commandDefinitions).toContain(definition);
  });

  it('writes the raw script to stdout and returns the resolved shell', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    try {
      const result = await completionDefinitions[0]!.handler({ shell: 'zsh' }, createMockRuntime().context);
      expect(result).toEqual({ shell: 'zsh' });
      expect(write).toHaveBeenCalledOnce();
      expect(String(write.mock.calls[0]![0])).toContain('#compdef peer');
    } finally {
      write.mockRestore();
    }
  });

  it.each(COMPLETION_SHELLS)('prints a %s script through the CLI with no error envelope', async (shell) => {
    const result = await runCliInProcess(['node', 'peer', 'completion', shell]);
    expect(result.exitCode).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('peer');
    expect(result.stdout).not.toContain('"ok": true');
  });

  it('rejects an unsupported shell with the canonical validation error', async () => {
    const result = await runCliInProcess(['node', 'peer', 'completion', 'powershell']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"code": "VALIDATION_ERROR"');
    expect(result.stderr).toContain('bash, zsh, fish');
  });

  it('rejects a missing shell argument', async () => {
    const result = await runCliInProcess(['node', 'peer', 'completion']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('"ok": false');
  });
});
