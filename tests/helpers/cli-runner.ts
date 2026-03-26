import { vi } from 'vitest';
import { runCli } from '../../src/cli.js';
import type { RuntimeDeps } from '../../src/commands/framework.js';

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

export async function runCliInProcess(argv: string[], deps?: RuntimeDeps): Promise<CliRunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const previousExitCode = process.exitCode;

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(String(chunk));
    return true;
  });

  process.exitCode = undefined;

  try {
    await runCli(argv, deps);
    return {
      stdout: stdout.join(''),
      stderr: stderr.join(''),
      exitCode: process.exitCode,
    };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = previousExitCode;
  }
}
