// Syntax highlighting for Pulse code. Produces HTML where every piece of user text is escaped.
import { INSTRUMENTS, WAVES, EFFECTS, DRUMS } from '/shared/lang/spec.js';

const KEYWORDS = new Set(['bpm', 'swing', 'key', 'loop', 'master', 'mute', 'solo', 'section', 'every', 'bars', 'voice', 'mic', 'female', 'male', 'bar', 'style']);
const EFFECT_NAMES = new Set(Object.keys(EFFECTS));
const INSTR = new Set(INSTRUMENTS);
const WAVE_SET = new Set(WAVES);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, text) => `<span class="tk-${cls}">${esc(text)}</span>`;

function pattern(text) {
  // text includes the surrounding quotes
  let out = '';
  for (const part of text.split(/(\s+|\[|\]|,)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part) || part === ',' || part === '[' || part === ']') out += esc(part);
    else if (part === '"') out += esc(part);
    else {
      const bare = part.replace(/^"|"$/g, '');
      const q1 = part.startsWith('"') ? '"' : '';
      const q2 = part.endsWith('"') && part.length > 1 ? '"' : '';
      let cls = 'note';
      if (/^x/.test(bare)) cls = 'hit';
      else if (/^\./.test(bare)) cls = 'rest';
      else if (/^_/.test(bare)) cls = 'hold';
      out += esc(q1) + span(cls, bare) + esc(q2);
    }
  }
  return out;
}

export function highlightLine(line) {
  const comment = line.indexOf('//');
  const code = comment === -1 ? line : line.slice(0, comment);
  const tail = comment === -1 ? '' : span('comment', line.slice(comment));
  let out = '';
  const re = /"[^"]*"?|[A-Za-z_#][\w#]*|-?\d+(?:\.\d+)?|\s+|[^\sA-Za-z0-9"]+/g;
  let first = true;
  for (const m of code.matchAll(re)) {
    const t = m[0];
    if (t.startsWith('"')) out += pattern(t);
    else if (/^\s+$/.test(t)) out += esc(t);
    else if (/^-?\d/.test(t)) out += span('num', t);
    else if (/^[A-Za-z_]/.test(t)) {
      if (KEYWORDS.has(t) && (first || t === 'bars')) out += span('kw', t);
      else if (INSTR.has(t)) out += span(DRUMS.includes(t) ? 'drum' : 'inst', t);
      else if (WAVE_SET.has(t)) out += span('wave', t);
      else if (EFFECT_NAMES.has(t)) out += span('fx', t);
      else if (t === 'on' || t === 'off' || t === 'major' || t === 'minor') out += span('kw', t);
      else out += esc(t);
    } else out += esc(t);
    if (!/^\s+$/.test(t)) first = false;
  }
  return out + tail;
}

export function highlight(source, { errorLines = new Set(), warnLines = new Set(), activeLines = new Set() } = {}) {
  return source
    .split('\n')
    .map((line, i) => {
      const n = i + 1;
      const cls = ['ln', errorLines.has(n) ? 'err' : '', warnLines.has(n) ? 'warn' : '', activeLines.has(n) ? 'active' : '']
        .filter(Boolean)
        .join(' ');
      return `<div class="${cls}">${highlightLine(line) || ' '}</div>`;
    })
    .join('');
}
