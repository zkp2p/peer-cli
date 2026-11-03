import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const marker = 'RUNTIME_VALUE_MUST_NOT_APPEAR';
const fileSource = 'runtime config from /run/secrets/runtime.json\n';
const envSource = 'runtime config from container env (legacy)\n';

// Substitute only the host mount; execute the real wrapper and child processes.
function runRuntime(config: unknown, child = 'console.log("child started")', raw?: string, env: NodeJS.ProcessEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'peer-mcp-runtime-'));
  try {
    if (raw === 'read-error') {
      mkdirSync(join(dir, 'runtime.json')); // Reading a directory fails with EISDIR, not ENOENT.
    } else if (raw !== 'missing-file') {
      writeFileSync(join(dir, 'runtime.json'), raw ?? JSON.stringify(config), { mode: 0o600 });
    }
    const preload = join(dir, 'mount.cjs');
    writeFileSync(preload, `
      const fs = require('node:fs');
      const read = fs.readFileSync;
      fs.readFileSync = function (path, ...args) {
        return read.call(this, path === '/run/secrets/runtime.json'
          ? require('node:path').join(__dirname, 'runtime.json') : path, ...args);
      };
    `);
    return spawnSync(process.execPath, [
      '--require', preload, resolve('deploy/runtime.cjs'), '-e', child,
    ], {
      env: { ...process.env, NODE_ENV: 'old-environment', PORT: '18081', ...env },
      encoding: 'utf8', timeout: 5000,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function expectRejected(config: unknown, key: string, raw?: string, env?: NodeJS.ProcessEnv) {
  const result = runRuntime(config, undefined, raw, env);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(key);
  expect(result.stderr).not.toContain(marker);
  expect(result.stderr).not.toContain('child started');
}

describe('MCP runtime configuration', () => {
  it('loads NODE_ENV and preserves the blue-green slot PORT', () => {
    const result = runRuntime({ NODE_ENV: 'production' },
      'console.log(JSON.stringify({ nodeEnv: process.env.NODE_ENV, port: process.env.PORT }))');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ nodeEnv: 'production', port: '18081' });
    expect(result.stderr).toBe(fileSource);
  });

  it('rejects missing keys even when container env provides them', () => {
    expectRejected({}, 'NODE_ENV');
  });

  it.each(['EXTRA', 'PORT'])('rejects the extra key %s', (key) => {
    expectRejected({ NODE_ENV: marker, [key]: marker }, key);
  });

  it.each([null, 123, true, [marker], { nested: marker }])('rejects a non-string NODE_ENV: %j', (value) => {
    expectRejected({ NODE_ENV: value }, 'NODE_ENV');
  });

  it.each([null, [marker], marker, 123])('rejects a non-object document: %j', (config) => {
    expectRejected(config, 'Runtime configuration');
  });

  it('never prints JSON parser errors containing input values', () => {
    expectRejected(null, 'runtime configuration', `{"NODE_ENV":"${marker}" BROKEN}`);
  });

  it('loads NODE_ENV from legacy env and preserves PORT when the host file is missing', () => {
    const result = runRuntime(null,
      'console.log(JSON.stringify({ nodeEnv: process.env.NODE_ENV, port: process.env.PORT }))',
      'missing-file', { NODE_ENV: 'production', EXTRA: marker });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ nodeEnv: 'production', port: '18081' });
    expect(result.stderr).toBe(envSource);
  });

  it('names NODE_ENV when it is missing from legacy env', () => {
    expectRejected(null, 'missing: NODE_ENV', 'missing-file', { NODE_ENV: undefined });
  });

  it('fails closed on a non-ENOENT read error even with valid container env', () => {
    expectRejected(null, 'Cannot read or parse runtime configuration', 'read-error');
  });

  describe.each(['file', 'env'])('%s source', (source) => {
    it.each([15, 16])('redacts values at the 16-character threshold (%i)', (length) => {
      const value = 'S'.repeat(length);
      const result = runRuntime({ NODE_ENV: value }, `
        const value = process.env.NODE_ENV;
        process.stdout.write(value.slice(0, 8));
        process.stderr.write(value.slice(0, 8));
        setTimeout(() => {
          process.stdout.write(value.slice(8) + '\\n');
          process.stderr.write(value.slice(8));
        }, 20);
      `, source === 'env' ? 'missing-file' : undefined, { NODE_ENV: value });
      expect(result.status).toBe(0);
      const expected = length >= 16 ? '[REDACTED]' : value;
      expect(result.stdout).toBe(`${expected}\n`);
      expect(result.stderr).toBe((source === 'env' ? envSource : fileSource) + expected);
    });
  });

  it('preserves the child exit status', () => {
    expect(runRuntime({ NODE_ENV: 'production' }, 'process.exit(7)').status).toBe(7);
  });
});
