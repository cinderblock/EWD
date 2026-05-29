/**
 * Builds everything that ships in the npm package:
 *
 * - `dist/ewd.js`, `dist/ewe.js` — the CLIs, CJS bundles with a node shebang.
 * - `dist/index.mjs`, `dist/index.cjs` — the library API (ESM + CJS).
 *
 * All dependencies are inlined, so the published package declares no runtime
 * dependencies. Type declarations (`dist/index.d.ts` + friends) are emitted
 * separately by `tsc -p tsconfig.build.json` in the `build` npm script.
 */

import { build, type BuildConfig } from 'bun';

async function run(label: string, config: BuildConfig) {
  const result = await build(config);
  if (!result.success) {
    console.error(`build failed: ${label}`);
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  for (const out of result.outputs) console.log(`built ${out.path}`);
}

// CLIs — CJS bundles, executable.
await run('clis', {
  entrypoints: ['src/ewd.ts', 'src/ewe.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'cjs',
  banner: '#!/usr/bin/env node',
});

// Library — ESM and CJS.
await run('lib-esm', {
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  naming: '[name].mjs',
});

await run('lib-cjs', {
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'cjs',
  naming: '[name].cjs',
});
