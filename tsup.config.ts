import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['@zkp2p/sdk', 'viem'],
});
