#!/usr/bin/env node
import { resolve } from 'node:path';
import { Command, CommanderError } from 'commander';
import { registerDefinitions, type RuntimeDeps } from './commands/framework.js';
import { commandDefinitions } from './commands/registry.js';
import { buildOutput, renderOutput } from './output/formatter.js';
import { createError, normalizeError } from './output/errors.js';
import { readPackageVersion } from './utils/package.js';

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && /(?:^|[/\\])(?:src[/\\]cli\.ts|dist[/\\]cli\.(?:cjs|js))$/.test(resolve(entry));
}

export async function createProgram(deps?: RuntimeDeps): Promise<Command> {
  const program = new Command();
  const version = readPackageVersion();

  program
    .name('peer')
    .description('CLI for the Peer (ZKP2P) protocol')
    .version(version)
    .showHelpAfterError(false);

  program.option('--env <value>', 'Runtime environment (production, preproduction, or staging).');
  program.option('--private-key <hex>', 'Hex-encoded private key. Warning: visible in process listings. Prefer PEER_PRIVATE_KEY.');
  program.option('--wallet-path <path>', 'Path to a file containing a private key.');
  program.option('--rpc-url <url>', 'Override the Base RPC URL.');
  program.option('--api-key <value>', 'Curator API key for SDK-backed authenticated routes.');
  program.option('--indexer-key <value>', 'Indexer API key.');
  program.option('--indexer-url <url>', 'Indexer base URL override.');
  program.option('--market-api-key <value>', 'Peerlytics API key.');
  program.option('--pay-api-key <value>', 'Pay API key.');
  program.option('--base-api-url <url>', 'Base API URL override for SDK services.');
  program.option('--market-base-url <url>', 'Peerlytics base URL override.');
  program.option('--pay-base-url <url>', 'Pay API base URL override.');
  program.option('--format <value>', 'Output format: json or table.', 'json');
  program.option('--yes', 'Skip dry-run previews and execute immediately.');
  program.option('--debug', 'Enable verbose debug logging.');
  program.configureOutput({
    writeErr: () => undefined,
  });
  program.exitOverride();

  registerDefinitions(program, commandDefinitions, deps);
  return program;
}

const GLOBAL_OPTIONS_WITH_VALUES = new Set([
  '--env',
  '--private-key',
  '--wallet-path',
  '--rpc-url',
  '--api-key',
  '--indexer-key',
  '--indexer-url',
  '--market-api-key',
  '--pay-api-key',
  '--base-api-url',
  '--market-base-url',
  '--pay-base-url',
  '--format',
]);

function inferEnv(argv: string[]): string {
  const envIndex = argv.indexOf('--env');
  if (envIndex >= 0 && typeof argv[envIndex + 1] === 'string') {
    return argv[envIndex + 1] as string;
  }
  return process.env.PEER_ENV ?? 'unknown';
}

function inferCommand(argv: string[]): string {
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
      )
    : normalizeError(error);

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
  const program = await createProgram(deps);
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommanderError && (error.code === 'commander.helpDisplayed' || error.code === 'commander.version')) {
      return program;
    }

    const rendered = renderTopLevelError(error, argv);
    process.stderr.write(`${rendered}\n`);
    process.exitCode = error instanceof CommanderError ? error.exitCode : 1;
  }
  return program;
}

async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (isMainModule()) {
  void main();
}
