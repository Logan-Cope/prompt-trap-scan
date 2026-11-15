// Builds dist/: the static site that GitHub Pages serves.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const f of ['index.html', 'app.js', 'styles.css', 'favicon.svg']) fs.copyFileSync(path.join(root, 'site', f), path.join(dist, f));
for (const f of ['scan.js', 'highlight.js', 'eval-core.js']) fs.copyFileSync(path.join(root, 'src', f), path.join(dist, f));
fs.cpSync(path.join(root, 'corpus'), path.join(dist, 'corpus'), { recursive: true });

// The bookmarklet is one minified IIFE with no external requests, so it runs
// under strict page CSP that blocks remote scripts.
const out = await build({
  entryPoints: [path.join(root, 'src/bookmarklet.js')],
  bundle: true, minify: true, write: false, format: 'iife', target: 'es2020', legalComments: 'none'
});
const code = out.outputFiles[0].text.trim();
fs.writeFileSync(path.join(dist, 'bookmarklet.js'), code + '\n');
fs.writeFileSync(path.join(dist, 'bookmarklet.txt'), 'javascript:' + encodeURIComponent(code));
console.log(`dist/ built, bookmarklet ${code.length} bytes`);
