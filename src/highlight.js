// @ts-check
/**
 * Marks findings on a page with outlines. Additive only: it sets one
 * attribute and adds one style element, and `clear` removes both. It never
 * changes, removes or answers anything the page says.
 */
(function (global) {
  'use strict';

  const STYLE_ID = 'pts-style';
  const ATTR = 'data-pts';
  const CSS =
    '[data-pts="trap"]{outline:3px solid #ffd84a!important;outline-offset:2px!important;background:rgba(255,216,74,.35)!important}' +
    '[data-pts="a11y"]{outline:2px dashed #2f6b4f!important;outline-offset:2px!important}' +
    '[data-pts="review"]{outline:2px dotted #8a5a00!important;outline-offset:2px!important}';

  /** @param {Document} doc @param {any} report */
  function mark(doc, report) {
    clear(doc);
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
    let n = 0;
    for (const f of report.findings) {
      const el = doc.querySelector(f.selector);
      if (!el) continue;
      const kind = f.bucket === 'accessibility' ? 'a11y' : f.bucket === 'concealed-prose' ? 'review' : 'trap';
      el.setAttribute(ATTR, kind);
      n++;
    }
    return n;
  }

  /** @param {Document} doc */
  function clear(doc) {
    const s = doc.getElementById(STYLE_ID);
    if (s) s.remove();
    doc.querySelectorAll('[' + ATTR + ']').forEach(function (e) { e.removeAttribute(ATTR); });
  }

  const api = { mark, clear };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else /** @type {any} */ (global).PromptTrapHighlight = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
