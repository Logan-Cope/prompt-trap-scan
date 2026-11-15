// @ts-check
// Bundled by scripts/build.mjs into one self-contained snippet. Click it on
// any page: it scans, outlines what it found, and shows a small report.
import Scan from './scan.js';
import Hl from './highlight.js';

(function () {
  const old = document.getElementById('pts-panel');
  if (old) { old.remove(); Hl.clear(document); return; }

  const report = Scan.scan(document);
  Hl.mark(document, report);

  const host = document.createElement('div');
  host.id = 'pts-panel';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:12px;right:12px;width:min(420px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#fff;color:#14202b;border:2px solid #14202b;font:13px/1.45 system-ui,sans-serif;box-shadow:4px 4px 0 #14202b';
  const root = host.attachShadow({ mode: 'open' });
  const bad = report.verdict === 'trap';
  const rows = report.findings.map(function (/** @type {any} */ f) {
    const li = document.createElement('li');
    li.style.cssText = 'margin:0 0 10px;padding:0 0 10px;border-bottom:1px solid #d5dbe2';
    const head = document.createElement('b');
    head.textContent = f.bucket.replace('-', ' ') + (f.concealedBy.length ? ' (' + f.concealedBy.join(', ') + ')' : '');
    const body = document.createElement('div');
    body.textContent = f.text || f.decoded || '';
    body.style.cssText = 'font-family:ui-monospace,monospace;font-size:12px;margin-top:2px;overflow-wrap:anywhere';
    li.append(head, body);
    return li;
  });
  const wrap = document.createElement('div');
  wrap.style.cssText = 'padding:12px 14px';
  const title = document.createElement('div');
  title.textContent = report.verdict.toUpperCase() + '. ' + report.summary;
  title.style.cssText = 'font-weight:700;margin-bottom:10px;' + (bad ? 'background:#ffd84a;padding:4px 6px' : '');
  const list = document.createElement('ol');
  list.style.cssText = 'margin:0;padding:0;list-style:none';
  list.append(...rows);
  const close = document.createElement('button');
  close.textContent = 'Close';
  close.style.cssText = 'font:inherit;margin-top:6px;padding:4px 10px;border:1px solid #14202b;background:#fff;cursor:pointer';
  close.onclick = function () { host.remove(); Hl.clear(document); };
  wrap.append(title, list, close);
  root.append(wrap);
  document.documentElement.appendChild(host);
})();
