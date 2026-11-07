// Interface language: English (source) and Latin American Spanish.
// The app is written in English. This module translates what is on screen by exact text match
// (text nodes and a few attributes), so every view, modal and toast is covered without wrapping each string.
// Text that is not in the dictionary stays in English, and user content (song names, code) never matches.
const KEY = 'pulse-lang';
export const LANGS = [['en', 'English'], ['es', 'Español']];
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP = 'textarea, script, style, [data-notranslate], .ed-layer, .ed-gutter, .editor, .mn-code pre, .secret';

let lang = 'en';
let dict = null; // { exact: {en: es}, patterns: [[RegExp, fn]] }
const originals = new WeakMap(); // text node -> English text
const attrOriginals = new WeakMap(); // element -> { attr: English text }
const written = new WeakMap(); // text node -> last text we wrote (to ignore our own mutations)
let observer = null;

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch { /* storage blocked */ }
  return /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
}

export const getLang = () => lang;

// Translate one English string. Returns the same string when there is no translation.
export function t(en, vars) {
  let out = en;
  if (lang === 'es' && dict) out = lookup(en);
  if (vars) out = out.replace(/\{(\w+)\}/g, (_m, k) => (vars[k] ?? `{${k}}`));
  return out;
}

function lookup(text) {
  const key = text.trim();
  if (!key) return text;
  let es = dict.exact[key];
  if (es === undefined) {
    for (const [re, fn] of dict.patterns) {
      const m = re.exec(key);
      if (m) { es = fn(...m.slice(1)); break; }
    }
  }
  if (es === undefined) return text;
  const lead = text.match(/^\s*/)[0];
  const trail = text.match(/\s*$/)[0];
  return lead + es + trail;
}

const skipped = (node) => {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !el || !!el.closest?.(SKIP);
};

function translateText(node) {
  if (skipped(node)) return;
  const current = node.nodeValue;
  if (written.get(node) === current && originals.has(node)) return; // our own write
  originals.set(node, current);
  const next = lang === 'es' && dict ? lookup(current) : current;
  if (next !== current) { written.set(node, next); node.nodeValue = next; }
}

function translateAttrs(el) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute?.(a)) continue;
    const bag = attrOriginals.get(el) ?? {};
    const cur = el.getAttribute(a);
    if (bag[a] && bag[a].written === cur) continue;
    const next = lang === 'es' && dict ? lookup(cur) : cur;
    bag[a] = { en: cur, written: next };
    attrOriginals.set(el, bag);
    if (next !== cur) el.setAttribute(a, next);
  }
}

function walk(root) {
  if (!root) return;
  if (root.nodeType === 3) return translateText(root);
  if (root.nodeType !== 1) return;
  translateAttrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n = it.nextNode();
  while (n) {
    if (n.nodeType === 3) translateText(n); else translateAttrs(n);
    n = it.nextNode();
  }
}

// Re-applies the current language to everything already on screen (used when the language changes).
function retranslateAll() {
  const it = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n = it.nextNode();
  while (n) {
    if (n.nodeType === 3) {
      if (!skipped(n) && originals.has(n)) {
        const en = originals.get(n);
        const next = lang === 'es' && dict ? lookup(en) : en;
        written.set(n, next);
        if (n.nodeValue !== next) n.nodeValue = next;
      } else translateText(n);
    } else {
      const bag = attrOriginals.get(n);
      if (bag) {
        for (const [a, v] of Object.entries(bag)) {
          if (!n.hasAttribute(a) || n.getAttribute(a) !== v.written) continue;
          const next = lang === 'es' && dict ? lookup(v.en) : v.en;
          bag[a] = { en: v.en, written: next };
          if (n.getAttribute(a) !== next) n.setAttribute(a, next);
        }
      }
      translateAttrs(n);
    }
    n = it.nextNode();
  }
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => walk(n));
      else if (r.type === 'characterData') translateText(r.target);
      else if (r.type === 'attributes') translateAttrs(r.target);
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

async function load(next) {
  if (next === 'es' && !dict) dict = (await import('./i18n/es.js')).default;
}

export async function setLang(next, { persist = true } = {}) {
  if (next !== 'en' && next !== 'es') return;
  await load(next);
  lang = next;
  if (persist) { try { localStorage.setItem(KEY, next); } catch { /* ignore */ } }
  document.documentElement.lang = next === 'es' ? 'es-419' : 'en';
  document.title = t(document.title === 'Pulse Studio' ? 'Pulse Studio' : document.title);
  retranslateAll();
  window.dispatchEvent(new CustomEvent('lang:change', { detail: { lang: next } }));
}

export async function initI18n() {
  lang = detect();
  await load(lang);
  document.documentElement.lang = lang === 'es' ? 'es-419' : 'en';
  startObserver();
}
