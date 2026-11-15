// Fail fast, with a fix, when Playwright's Chromium is not installed.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const MESSAGE = 'Chromium is not installed for Playwright. Run: npx playwright install chromium';

export function chromiumInstalled() {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!chromiumInstalled()) {
    console.error(MESSAGE);
    process.exit(1);
  }
}
