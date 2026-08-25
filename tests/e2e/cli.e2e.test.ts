import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

type PeerRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const repoRoot = process.cwd();
const tsxCliPath = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const tempHomes: string[] = [];

async function runPeer(args: string[], homeDir: string, entryPath = join(repoRoot, 'src', 'cli.ts')): Promise<PeerRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, entryPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: homeDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

async function makeHomeDir(): Promise<string> {
  const homeDir = await mkdtemp(join(tmpdir(), 'peer-cli-e2e-'));
  tempHomes.push(homeDir);
  return homeDir;
}

afterEach(async () => {
  await Promise.all(tempHomes.splice(0).map((homeDir) => rm(homeDir, { recursive: true, force: true })));
});

describe('peer cli e2e', () => {
  it('prints the top-level help output', async () => {
    const homeDir = await makeHomeDir();
    const result = await runPeer(['--help'], homeDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: peer');
    expect(result.stdout).toContain('quote');
    expect(result.stdout).toContain('mcp');
  }, 15_000);

  it('runs through an installed peer bin symlink', async () => {
    const homeDir = await makeHomeDir();
    const binDir = await makeHomeDir();
    const binPath = join(binDir, 'peer');
    await symlink(join(repoRoot, 'src', 'cli.ts'), binPath);

    const result = await runPeer(['--help'], homeDir, binPath);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: peer');
  }, 15_000);

  it('persists config in an isolated HOME directory', async () => {
    const homeDir = await makeHomeDir();

    const setResult = await runPeer(['config', 'set', 'env', 'staging'], homeDir);
    expect(setResult.exitCode).toBe(0);
    expect(setResult.stderr).toBe('');
    expect(setResult.stdout).toContain('"ok": true');
    expect(setResult.stdout).toContain('"env": "staging"');

    const showResult = await runPeer(['config', 'show'], homeDir);
    expect(showResult.exitCode).toBe(0);
    expect(showResult.stderr).toBe('');

    const payload = JSON.parse(showResult.stdout) as {
      ok: boolean;
      data: {
        stored: { env?: string };
        resolved: { env: string };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.data.stored.env).toBe('staging');
    expect(payload.data.resolved.env).toBe('staging');
  }, 15_000);
});
