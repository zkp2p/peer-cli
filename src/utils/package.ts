import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const FALLBACK_VERSION = '0.1.0';
const PACKAGE_NAME = '@zkp2p/peer-cli';
const MAX_LOOKUP_DEPTH = 4;

function* candidatePackagePaths(): Generator<string> {
  const startDirs = new Set<string>([process.cwd()]);
  if (process.argv[1]) {
    startDirs.add(dirname(resolve(process.argv[1])));
  }

  for (const startDir of startDirs) {
    let current = startDir;
    for (let depth = 0; depth <= MAX_LOOKUP_DEPTH; depth += 1) {
      yield join(current, 'package.json');
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
}

export function readPackageVersion(): string {
  let fallbackVersion: string | undefined;

  try {
    for (const path of candidatePackagePaths()) {
      if (!existsSync(path)) {
        continue;
      }

      const raw = readFileSync(path, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
        continue;
      }
      if (pkg.name === PACKAGE_NAME) {
        return pkg.version;
      }
      fallbackVersion ??= pkg.version;
    }

    if (fallbackVersion) {
      return fallbackVersion;
    }

    process.stderr.write(`Warning: ${PACKAGE_NAME} package.json is missing a version field; falling back to ${FALLBACK_VERSION}.\n`);
  } catch (error) {
    process.stderr.write(
      `Warning: failed to read package version; falling back to ${FALLBACK_VERSION}. ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  return FALLBACK_VERSION;
}
