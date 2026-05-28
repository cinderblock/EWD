/**
 * Bundles the two CLIs into self-contained, node-runnable scripts under
 * `dist/`. All dependencies (winston, command-line-args, mdb-reader, the
 * node-pkware fork) are inlined, so the published package declares no
 * runtime dependencies. A `#!/usr/bin/env node` banner makes the output
 * directly executable as the `ewd` / `ewe` bin commands.
 */

import { build } from 'bun';

const result = await build({
  entrypoints: ['src/ewd.ts', 'src/ewe.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'cjs',
  banner: '#!/usr/bin/env node',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const out of result.outputs) {
  console.log(`built ${out.path}`);
}
