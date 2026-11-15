// @ts-check
/**
 * Scoring for the fixture corpus, shared by the CI eval (Node + Playwright)
 * and the live gallery, so the number on the page is the number in CI.
 * Also holds the naive baseline the scanner has to beat.
 */
(function (global) {
  'use strict';

  /** Display:none on the element itself plus a short keyword list. */
  const NAIVE_KEYWORDS = /ignore (?:all )?(?:the )?(?:previous|prior|above)|if you are an? (?:ai|llm|bot)|language model|\bllm\b|as an ai/i;

  /**
   * @param {Document} doc
   * @returns {{ text: string }[]}
   */
  function naiveScan(doc) {
    const win = /** @type {Window} */ (doc.defaultView);
    const hits = [];
    for (const el of Array.from(doc.body.querySelectorAll('*'))) {
      if (win.getComputedStyle(el).display !== 'none') continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (NAIVE_KEYWORDS.test(text)) hits.push({ text });
    }
    return hits;
  }

  /** @param {string} s */
  function flat(s) {
    return s.normalize('NFKC').toLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, ' ');
  }

  /**
   * @param {any} entry manifest entry
   * @param {any} report
   * @param {{ text: string }[]} naive
   */
  function score(entry, report, naive) {
    /** @type {any} */
    const out = { id: entry.id, kind: entry.kind, planted: [], falseFlags: 0, naiveFalseFlags: 0, accessibilityOk: true, verdict: report.verdict, verdictOk: true };
    const count = report.counts;
    if (entry.kind === 'trap') {
      out.planted = entry.planted.map(function (/** @type {any} */ p) {
        const frag = flat(p.fragment);
        const found = report.findings.some(function (/** @type {any} */ f) {
          if (f.bucket === 'concealed-prose' || f.bucket === 'accessibility') return false;
          if (!flat(f.text + ' ' + (f.decoded || '')).includes(frag)) return false;
          return p.method === 'visible' ? f.bucket === 'visible-trap'
            : p.method === 'zero-width' ? f.bucket === 'zero-width'
            : f.concealedBy.includes(p.method);
        });
        const naiveFound = naive.some(function (h) { return flat(h.text).includes(frag); });
        return { fragment: p.fragment, method: p.method, found, naiveFound };
      });
    } else if (entry.kind === 'clean') {
      out.falseFlags = count['hidden-trap'] + count['visible-trap'] + count['zero-width'];
      out.naiveFalseFlags = naive.length;
      out.accessibilityOk = count.accessibility === (entry.accessibility || 0);
      out.verdictOk = report.verdict === (entry.expectVerdict || 'clean');
    }
    return out;
  }

  /** @param {any[]} rows output of score() for every fixture */
  function summarize(rows) {
    const planted = rows.flatMap(function (r) { return r.planted; });
    const clean = rows.filter(function (r) { return r.kind === 'clean'; });
    /** @type {Record<string, {n:number, found:number, naive:number}>} */
    const byMethod = {};
    for (const p of planted) {
      const m = byMethod[p.method] || (byMethod[p.method] = { n: 0, found: 0, naive: 0 });
      m.n++; if (p.found) m.found++; if (p.naiveFound) m.naive++;
    }
    return {
      planted: planted.length,
      found: planted.filter(function (p) { return p.found; }).length,
      naiveFound: planted.filter(function (p) { return p.naiveFound; }).length,
      cleanPages: clean.length,
      falseFlags: clean.reduce(function (a, r) { return a + r.falseFlags; }, 0),
      naiveFalseFlags: clean.reduce(function (a, r) { return a + r.naiveFalseFlags; }, 0),
      accessibilityRouted: clean.filter(function (r) { return r.accessibilityOk; }).length,
      verdictsOk: clean.filter(function (r) { return r.verdictOk; }).length,
      byMethod
    };
  }

  const api = { naiveScan, score, summarize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else /** @type {any} */ (global).PromptTrapEval = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
