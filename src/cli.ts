#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerDefinitions, type RuntimeDeps } from './commands/framework.js';
import { commandDefinitions } from './commands/registry.js';

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  const pkg = JSON.parse(raw) as { version?: string };
  return pkg.version ?? '0.1.0';
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

export async function createProgram(deps?: RuntimeDeps): Promise<Command> {
  const program = new Command();
  const version = await readPackageVersion();

  program
    .name('peer')
    .description('CLI for the Peer (ZKP2P) protocol')
    .version(version)
    .showHelpAfterError();

  program.option('--env <value>', 'Runtime environment (production or staging).');
  program.option('--private-key <hex>', 'Hex-encoded private key.');
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

  registerDefinitions(program, commandDefinitions, deps);
  return program;
}

export async function runCli(argv: string[] = process.argv, deps?: RuntimeDeps): Promise<Command> {
  const program = await createProgram(deps);
  await program.parseAsync(argv);
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
