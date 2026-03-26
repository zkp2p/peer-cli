import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  outDir: 'dist',
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'node22',
  outExtension: () => ({ js: '.cjs' }),
  noExternal: ['@zkp2p/sdk', '@zkp2p/contracts-v2', '@zkp2p/indexer-schema', 'viem', 'ethers', 'ox'],
});
