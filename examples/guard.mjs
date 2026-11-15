// A guard an agent runs before it acts on a page.
// Usage: node examples/guard.mjs <url-or-file.html>
// Exit code 0: clean. 1: trap or review. The scanner only reports; this
// script is where you decide what your agent does with the verdict.
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
if (!arg) { console.error('usage: node examples/guard.mjs <url-or-file.html>'); process.exit(2); }
const target = /^https?:|^file:/.test(arg) ? arg : pathToFileURL(path.resolve(arg)).href;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(target);
await page.addScriptTag({ path: path.join(root, 'src/scan.js') });
const report = await page.evaluate(() => window.PromptTrapScan.scan(document));
await browser.close();

console.log(`${report.verdict.toUpperCase()}: ${report.summary}`);
for (const f of report.findings.filter((x) => x.bucket !== 'accessibility')) {
  const how = f.concealedBy.length ? ` [${f.concealedBy.join(', ')}]` : '';
  console.log(`  ${f.bucket}${how}: ${f.text || f.decoded}`);
}
process.exit(report.verdict === 'clean' ? 0 : 1);
