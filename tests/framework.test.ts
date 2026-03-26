import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { createError } from '../src/output/errors.js';
import { buildInputSchema, executeDefinition, mergeCommandInput, registerDefinitions } from '../src/commands/framework.js';
import { createMockRuntime } from './helpers/mock-runtime.js';
import type { CommandExecutionContext, CommandDefinition } from '../src/commands/framework.js';

describe('framework helpers', () => {
  it('merges command input with raw params beneath explicit values', () => {
    expect(mergeCommandInput({ a: 2, b: undefined }, { a: 1, c: 3 })).toEqual({ a: 2, c: 3 });
  });

  it('builds a schema from positional args and options', () => {
    const schema = buildInputSchema({
      path: ['quote'],
      description: 'Quote',
      readOnly: true,
      args: [
        { name: 'from', description: 'Currency', schema: { type: 'string', description: 'Currency code' } },
        { name: 'owner', description: 'Optional owner', required: false, schema: { type: 'string', description: 'Owner' } },
      ],
      options: [
        { name: 'amount', flags: '--amount <value>', description: 'Amount', schema: { type: 'number', description: 'Amount', default: 5 } },
        { name: 'mode', flags: '--mode <value>', description: 'Mode', schema: { type: 'string', description: 'Mode', enum: ['fast', 'slow'] as const } },
      ],
      handler: async () => undefined,
    });

    expect(schema).toMatchObject({
      type: 'object',
      required: ['from'],
      properties: expect.objectContaining({
        from: expect.objectContaining({ type: 'string', description: 'Currency' }),
        owner: expect.objectContaining({ type: 'string', description: 'Optional owner' }),
        amount: expect.objectContaining({ type: 'number', default: 5 }),
        mode: expect.objectContaining({ enum: ['fast', 'slow'] }),
        params: expect.objectContaining({ type: 'object' }),
      }),
    });
  });

  it('registers definitions and rejects empty paths', () => {
    const program = new Command();
    registerDefinitions(program, [
      { path: ['group', 'leaf'], description: 'Leaf', readOnly: true, handler: async () => 'ok' },
    ]);

    expect(program.commands.map((command) => command.name())).toContain('group');
    expect(() =>
      registerDefinitions(program, [{ path: [], description: 'Bad', readOnly: true, handler: async () => undefined } as never]),
    ).toThrow('Command definitions must include at least one path segment.');
  });

  it('executes read-only and prepared write commands', async () => {
    const readSpec: CommandDefinition = {
      path: ['read'],
      description: 'Read',
      readOnly: true,
      handler: async () => ({ hello: 'world' }),
    };
    const readRuntime = createMockRuntime({ spec: readSpec });
    await expect(executeDefinition(readSpec, {}, { format: 'json', yes: false } as never, readRuntime.deps)).resolves.toMatchObject({
      ok: true,
      data: { hello: 'world' },
      meta: expect.objectContaining({ command: 'peer read', env: 'production' }),
    });

    const writeSpec: CommandDefinition = {
      path: ['write'],
      description: 'Write',
      readOnly: false,
      handler: async (_input: Record<string, unknown>, context: CommandExecutionContext) =>
        context.runPrepared({
          description: 'preview',
          prepare: async () => ({
            prepared: {
              to: '0x1111111111111111111111111111111111111111',
              data: '0x1234',
              value: 0n,
              chainId: 8453,
            },
            previewData: { draft: true },
          }),
          execute: async () => 'sent',
        }),
    };

    const yesRuntime = createMockRuntime({ spec: writeSpec, yes: true });
    await expect(executeDefinition(writeSpec, {}, { format: 'json', yes: true } as never, yesRuntime.deps)).resolves.toMatchObject({
      ok: true,
      data: {
        executed: true,
        preview: {
          to: '0x1111111111111111111111111111111111111111',
          data: '0x1234',
          value: '0',
          chainId: 8453,
        },
        previewData: { draft: true },
        result: 'sent',
      },
    });

    const errorSpec: CommandDefinition = {
      path: ['error'],
      description: 'Error',
      readOnly: true,
      handler: async () => {
        throw createError('VALIDATION_ERROR', 'bad input');
      },
    };

    await expect(executeDefinition(errorSpec, {}, { format: 'json', yes: false } as never, readRuntime.deps)).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR', category: 'validation', message: 'bad input' },
    });
  });
});
