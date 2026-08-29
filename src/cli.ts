#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, CommanderError } from 'commander';
import { registerDefinitions, type RuntimeDeps } from './commands/framework.js';
import { commandDefinitions } from './commands/registry.js';
import { GLOBAL_OPTIONS, GLOBAL_OPTIONS_WITH_VALUES } from './commands/global-options.js';
import { buildOutput, renderOutput } from './output/formatter.js';
import { createError, normalizeError } from './output/errors.js';
import { readPackageVersion } from './utils/package.js';

export function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && /(?:^|[/\\])(?:src[/\\]cli\.ts|dist[/\\]cli\.(?:cjs|js))$/.test(realpathSync(resolve(entry)));
}

export async function createProgram(deps?: RuntimeDeps): Promise<Command> {
  const program = new Command();
  const version = readPackageVersion();

  program
    .name('peer')
    .description('CLI for the Peer (ZKP2P) protocol')
    .version(version)
    .showHelpAfterError(false);

  for (const option of GLOBAL_OPTIONS) {
    program.option(option.flags, option.description, option.defaultValue);
  }
  program.configureOutput({
    writeErr: () => undefined,
  });
  program.exitOverride();

  registerDefinitions(program, commandDefinitions, deps);
  return program;
}

function inferEnv(argv: string[]): string {
  const envIndex = argv.indexOf('--env');
  if (envIndex >= 0 && typeof argv[envIndex + 1] === 'string') {
    return argv[envIndex + 1] as string;
  }
  return process.env.PEER_ENV ?? 'unknown';
}

function inferDebug(argv: string[]): boolean {
  return argv.includes('--debug');
}

export function inferCommand(argv: string[]): string {
  const tokens = argv.slice(2);
  const commandParts: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;

    if (commandParts.length === 0 && token.startsWith('-')) {
      if (GLOBAL_OPTIONS_WITH_VALUES.has(token)) {
        index += 1;
      }
      continue;
    }

    if (token.startsWith('-')) {
      break;
    }

    commandParts.push(token);
  }

  return commandParts.length > 0 ? `peer ${commandParts.join(' ')}` : 'peer';
}

function renderTopLevelError(error: unknown, argv: string[]): string {
  const commanderError = error instanceof CommanderError ? error : undefined;
  const normalized = commanderError
    ? normalizeError(
        createError('VALIDATION_ERROR', commanderError.message.replace(/^error:\s*/, ''), {
          details: { commanderCode: commanderError.code, exitCode: commanderError.exitCode },
        }),
        { includeDebugDetails: inferDebug(argv) },
      )
    : /* v8 ignore next */ normalizeError(error, { includeDebugDetails: inferDebug(argv) });

  return renderOutput(
    buildOutput(
      { ok: false, error: normalized },
      {
        command: inferCommand(argv),
        env: inferEnv(argv),
        chain: 'base',
        timestamp: new Date().toISOString(),
        duration_ms: 0,
      },
    ),
    'json',
  );
}

export async function runCli(argv: string[] = process.argv, deps?: RuntimeDeps): Promise<Command> {
  let program: Command | undefined;
  try {
    program = await createProgram(deps);
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && (error.code === 'commander.helpDisplayed' || error.code === 'commander.version')) {
      return program!;
    }

    const rendered = renderTopLevelError(error, argv);
    process.stderr.write(`${rendered}\n`);
    process.exitCode = error instanceof CommanderError ? error.exitCode : 1;
  }
  return program!;
}

/* v8 ignore next 3 -- entry-point guard only runs when script is executed directly */
if (isMainModule()) {
  void runCli();
}
