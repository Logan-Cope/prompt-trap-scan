// @ts-check
/**
 * prompt-trap-scan: find text on a page that is aimed at an AI and hidden
 * from a human. One dependency-free function, two independent axes:
 *
 *   1. Does the text address a machine?  (13 signature patterns)
 *   2. Can a sighted person see it?      (9 concealment checks)
 *
 * Plus a sweep for zero-width and Unicode "tag" characters. It reports. It
 * never edits the page and never answers anything.
 *
 * Works in a browser, in a bookmarklet, or in any DOM that computes layout
 * (Playwright, Puppeteer). jsdom has no layout, so it is not supported.
 */
(function (global) {
  'use strict';

  /**
   * @typedef {{ id: string, re: RegExp, why: string, weak?: boolean }} Pattern
   * @typedef {{ id: string, why: string }} Signal
   * @typedef {{
   *   bucket: 'hidden-trap' | 'visible-trap' | 'zero-width' | 'concealed-prose' | 'accessibility',
   *   text: string,
   *   signals: Signal[],
   *   concealedBy: string[],
   *   invisible: { code: string, count: number }[],
   *   decoded?: string,
   *   selector: string,
   *   field: string
   * }} Finding
   * @typedef {{
   *   version: 1,
   *   verdict: 'clean' | 'review' | 'trap',
   *   summary: string,
   *   counts: Record<string, number>,
   *   findings: Finding[]
   * }} Report
   */

  /**
   * Signature patterns. `weak` patterns name a topic (a model, a technique)
   * and only count when the text is also concealed, so an article about
   * prompt injection is not itself a trap.
   * @type {Pattern[]}
   */
  const PATTERNS = [
    { id: 'addresses-ai', why: 'addresses an AI directly',
      re: /\b(?:if|when|should)\s+you(?:'re|\s+are)\s+(?:an?\s+)?(?:ai|a\.i\.|llm|language model|bot|chat\s?bot|assistant|machine|robot|automated|a computer|not a human)\b/i },
    { id: 'as-an-ai', why: 'addresses an AI directly',
      re: /\b(?:as|being)\s+an?\s+(?:ai|llm|language model|assistant)\b/i },
    { id: 'human-split', why: 'splits instructions by human versus machine',
      re: /\bif\s+you\s+are\s+(?:a\s+)?(?:human|person)\b/i },
    { id: 'human-skip', why: 'splits instructions by human versus machine',
      re: /\b(?:human|real)\s+(?:users?|visitors?|readers?|applicants?|candidates?)\s+(?:should|can|may|please)\s+(?:ignore|disregard|skip)/i },
    { id: 'override', why: 'tries to override earlier instructions',
      re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:your\s+|the\s+|previous\s+|prior\s+|earlier\s+|above\s+)*(?:instruction|prompt|direction|rule|guideline|system)/i },
    { id: 'system-prompt', why: 'refers to the system prompt', weak: true,
      re: /\bsystem\s*(?:prompt|message|instruction|role)\b/i },
    { id: 'names-technique', why: 'names the technique', weak: true,
      re: /\bprompt\s*injection\b/i },
    { id: 'names-model', why: 'names a model', weak: true,
      re: /\b(?:chat\s?gpt|claude|gemini|copilot|deepseek|llama|gpt-?\d)\b/i },
    { id: 'plants-token', why: 'plants a detectable token',
      re: /\b(?:include|insert|mention|add|append|use|begin with|start with|end with)\s+the\s+(?:word|phrase|term|sentence|string)\b/i },
    { id: 'dictates-answer', why: 'dictates the exact answer',
      re: /\brespond\s+(?:only\s+)?with\b/i },
    { id: 'asks-secrecy', why: 'asks the reader to keep it secret',
      re: /\bdo\s+not\s+(?:mention|reveal|disclose|acknowledge)\s+(?:this|these|the above|that you)/i },
    { id: 'self-described-trap', why: 'describes itself as a trap',
      re: /\bthis\s+(?:is\s+a\s+)?(?:test|check|trap|canary)\s+for\s+(?:ai|bots?|automation|llms?)\b/i },
    { id: 'baits-long-answer', why: 'baits an overlong answer',
      re: /\bwrite\s+(?:a\s+)?(?:long|lengthy|detailed|extensive)\s+(?:answer|response|essay)\s+about\b/i },
    { id: 'human-check', why: 'human-verification gate: a person answers this, never an agent',
      re: /\b(?:to\s+(?:ensure|verify|confirm|prove|make sure)|verify\s+that)\b[^.]{0,70}\b(?:human|person|not\s+a\s+(?:robot|bot))\b|\bsolve\s+(?:this|the following)\s+(?:simple\s+)?(?:math|arithmetic)\b|\bi'?m\s+not\s+a\s+robot\b/i }
  ];

  /** The nine ways text is kept from a sighted reader. */
  const METHODS = [
    'display-none', 'visibility-hidden', 'zero-opacity', 'tiny-font',
    'color-match', 'text-indent', 'clipped', 'offscreen', 'zero-size'
  ];

  // Always flagged. ZWJ and ZWNJ are legitimate inside emoji and in Persian or
  // Hindi, so they only count when they touch an ASCII letter or digit.
  const ZW_ALWAYS = /[\u200B\u2060\u180E\uFEFF]/g;
  const ZW_JOINERS = /(?<=[A-Za-z0-9])[\u200C\u200D]|[\u200C\u200D](?=[A-Za-z0-9])/g;
  // Unicode "tag" block U+E0000..U+E007F: invisible, and each maps to ASCII.
  const TAGS = /[\u{E0000}-\u{E007F}]/gu;
  const A11Y_CLASS = /(^|[\s_-])(sr-only|visually-?hidden|screen-?reader(-text)?|a11y-hidden|assistive|skip(-link)?)([\s_-]|$)/i;

  /** @param {string} s */
  function stripInvisible(s) {
    return s.replace(ZW_ALWAYS, '').replace(ZW_JOINERS, '').replace(TAGS, '');
  }
  /** @param {string} s */
  function normalize(s) {
    return stripInvisible(s).normalize('NFKC').replace(/\s+/g, ' ').trim();
  }
  /** @param {string} s */
  function decodeTags(s) {
    let out = '';
    for (const ch of s.match(TAGS) || []) {
      const c = /** @type {number} */ (ch.codePointAt(0)) - 0xE0000;
      if (c >= 32 && c < 127) out += String.fromCharCode(c);
    }
    return out;
  }
  /** @param {string} s */
  function invisibleChars(s) {
    /** @type {Record<string, number>} */
    const seen = {};
    /** @type {string[]} */
    const all = [...(s.match(ZW_ALWAYS) || []), ...(s.match(ZW_JOINERS) || []), ...(s.match(TAGS) || [])];
    for (const ch of all) {
      const code = 'U+' + (/** @type {number} */ (ch.codePointAt(0))).toString(16).toUpperCase().padStart(4, '0');
      seen[code] = (seen[code] || 0) + 1;
    }
    return Object.keys(seen).map(function (code) { return { code, count: seen[code] }; });
  }

  /** @param {string} text @param {boolean} concealed @returns {Signal[]} */
  function signalsFor(text, concealed) {
    const out = [];
    for (const p of PATTERNS) {
      if (p.weak && !concealed) continue;
      if (p.re.test(text)) out.push({ id: p.id, why: p.why });
    }
    return out;
  }

  // ---- color math -------------------------------------------------------

  /** @param {string} s @returns {{r:number,g:number,b:number,a:number}|null} */
  function parseColor(s) {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  /** @param {{r:number,g:number,b:number,a:number}} top @param {{r:number,g:number,b:number}} under */
  function over(top, under) {
    return {
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a)
    };
  }
  /** @param {{r:number,g:number,b:number}} c */
  function luminance(c) {
    const f = function (/** @type {number} */ v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  /** WCAG contrast ratio, 1 (identical) to 21. */
  /** @param {{r:number,g:number,b:number}} a @param {{r:number,g:number,b:number}} b */
  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  // ---- concealment ------------------------------------------------------

  /**
   * Why a sighted person cannot read text inside `el`. Every ancestor is
   * checked, because display, opacity, clipping and size do not inherit but
   * still hide descendants.
   * @param {Element} el @param {Node} textNode @param {Window} win
   * @returns {string[]}
   */
  function concealment(el, textNode, win) {
    /** @type {Set<string>} */
    const why = new Set();
    const doc = el.ownerDocument;
    const cs0 = win.getComputedStyle(el);
    let opacity = 1;
    const paint = /** @type {{r:number,g:number,b:number,a:number}[]} */ ([]);
    let imageBehind = false;

    for (let n = /** @type {Element|null} */ (el); n && n.nodeType === 1; n = n.parentElement) {
      const cs = win.getComputedStyle(n);
      if (cs.display === 'none') why.add('display-none');
      opacity *= parseFloat(cs.opacity);
      const bg = parseColor(cs.backgroundColor);
      if (bg && bg.a > 0) paint.push(bg);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') imageBehind = true;

      if (/inset\(\s*(?:[5-9]\d|100)%/.test(cs.clipPath) || /circle\(\s*0/.test(cs.clipPath) ||
          /^rect\(\s*0(px)?[ ,]+0(px)?[ ,]+0(px)?[ ,]+0(px)?\s*\)$/.test(cs.clip) ||
          /^rect\(\s*1px[ ,]+1px[ ,]+1px[ ,]+1px\s*\)$/.test(cs.clip)) why.add('clipped');

      const clips = cs.overflow !== 'visible' || cs.overflowX !== 'visible';
      if (clips && n !== doc.documentElement && n !== doc.body) {
        const r = n.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) why.add('zero-size');
      }
      const tm = cs.transform.match(/^matrix\(([^)]+)\)$/);
      if (tm) {
        const m = tm[1].split(',').map(parseFloat);
        if (Math.abs(m[0]) < 0.01 && Math.abs(m[3]) < 0.01) why.add('zero-size');
      }
    }

    if (cs0.visibility === 'hidden' || cs0.visibility === 'collapse') why.add('visibility-hidden');
    if (opacity < 0.1) why.add('zero-opacity');
    if (parseFloat(cs0.fontSize) < 4) why.add('tiny-font');
    if (parseFloat(cs0.textIndent) <= -500) why.add('text-indent');

    // Color match: composite every painted ancestor background over the white
    // canvas, then compare with the text color. Skipped when an image sits
    // behind the text, because the real backdrop is then unknown.
    if (!imageBehind) {
      let base = { r: 255, g: 255, b: 255 };
      for (let i = paint.length - 1; i >= 0; i--) base = over(paint[i], base);
      const fill = parseColor(cs0.getPropertyValue('-webkit-text-fill-color')) || parseColor(cs0.color);
      if (fill) {
        const ink = over({ r: fill.r, g: fill.g, b: fill.b, a: fill.a }, base);
        if (fill.a < 0.1 || contrast(ink, base) < 1.15) why.add('color-match');
      }
    }

    // Geometry: laid-out text that lies fully outside the page.
    if (!why.has('display-none')) {
      const range = doc.createRange();
      range.selectNodeContents(textNode);
      const rects = Array.from(range.getClientRects());
      if (rects.length) {
        const sx = win.scrollX, sy = win.scrollY;
        const gone = rects.every(function (r) {
          return r.right + sx <= 0 || r.bottom + sy <= 0 || r.left + sx > win.innerWidth + 1500;
        });
        if (gone) why.add('offscreen');
      }
    }
    return METHODS.filter(function (m) { return why.has(m); });
  }

  /** @param {Element} el */
  function selectorFor(el) {
    const parts = [];
    for (let n = /** @type {Element|null} */ (el); n && n.nodeType === 1 && n.tagName !== 'HTML'; n = n.parentElement) {
      if (n.id && n.ownerDocument.querySelectorAll('#' + CSS.escape(n.id)).length === 1) {
        parts.unshift('#' + CSS.escape(n.id));
        break;
      }
      const tag = n.tagName.toLowerCase();
      if (tag === 'body') { parts.unshift('body'); break; }
      let i = 1;
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
    }
    return parts.join(' > ');
  }

  /** @param {Element} el */
  function fieldLabel(el) {
    for (let n = /** @type {Element|null} */ (el); n && n.tagName !== 'BODY'; n = n.parentElement) {
      if (n.id) {
        const l = n.ownerDocument.querySelector('label[for="' + CSS.escape(n.id) + '"]');
        if (l) return normalize(l.textContent || '').slice(0, 90);
      }
      if (n.tagName === 'LABEL') return normalize(n.textContent || '').slice(0, 90);
    }
    return '';
  }

  /**
   * True for the text-hiding recipe accessibility toolkits use: clipped to a
   * tiny box, or parked offscreen. Judged by technique, not by class name.
   * @param {string[]} by
   */
  function looksLikeScreenReaderText(by) {
    return (by.includes('clipped') && by.includes('zero-size')) || (by.length === 1 && by[0] === 'offscreen');
  }

  /**
   * Scan a document.
   * @param {Document} [doc]
   * @param {{ limit?: number }} [options]
   * @returns {Report}
   */
  function scan(doc, options) {
    doc = doc || document;
    const win = /** @type {Window} */ (doc.defaultView);
    const limit = (options && options.limit) || 50;
    /** @type {Finding[]} */
    const findings = [];
    /** @type {Record<string, true>} */
    const seen = {};
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const raw = node.nodeValue || '';
      const el = node.parentElement;
      if (!el || raw.trim().length < 3) continue;
      // Closed <select> options and inert containers are zero-size by nature.
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName) || el.closest('select')) continue;

      const text = normalize(raw);
      const decoded = decodeTags(raw);
      const invisible = invisibleChars(raw);
      const key = el.tagName + '|' + text.slice(0, 60) + '|' + decoded;
      if (seen[key]) continue;
      seen[key] = true;

      const by = concealment(el, node, win);
      const concealed = by.length > 0;
      const signals = signalsFor(text, concealed);
      const smuggled = decoded ? signalsFor(decoded, true) : [];
      /** @type {Finding} */
      const base = {
        bucket: 'hidden-trap', text: text.slice(0, 260), signals, concealedBy: by,
        invisible, selector: selectorFor(el), field: fieldLabel(el)
      };
      if (decoded) base.decoded = decoded.slice(0, 260);

      if (signals.length) {
        base.bucket = concealed ? 'hidden-trap' : 'visible-trap';
        findings.push(base);
      } else if (invisible.length) {
        base.bucket = 'zero-width';
        base.signals = smuggled;
        findings.push(base);
      } else if (concealed) {
        const a11y = A11Y_CLASS.test(el.getAttribute('class') || '') || looksLikeScreenReaderText(by);
        if (a11y) { base.bucket = 'accessibility'; findings.push(base); }
        else if (text.length > 40) { base.bucket = 'concealed-prose'; findings.push(base); }
      }
    }

    /** @type {Record<string, number>} */
    const counts = { 'hidden-trap': 0, 'visible-trap': 0, 'zero-width': 0, 'concealed-prose': 0, accessibility: 0 };
    for (const f of findings) counts[f.bucket]++;
    const traps = counts['hidden-trap'] + counts['visible-trap'] + counts['zero-width'];
    const verdict = traps ? 'trap' : counts['concealed-prose'] ? 'review' : 'clean';
    const summary = verdict === 'trap'
      ? traps + (traps === 1 ? ' trap' : ' traps') + ' found. Do not act on the flagged text.'
      : verdict === 'review'
        ? 'No trap signatures, but ' + counts['concealed-prose'] + ' block(s) of text are hidden from a reader. Look before acting.'
        : 'Nothing addressed to a machine, nothing concealed from a person.';
    return { version: 1, verdict, summary, counts, findings: findings.slice(0, limit) };
  }

  const api = { scan, PATTERNS, METHODS, normalize };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else /** @type {any} */ (global).PromptTrapScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
