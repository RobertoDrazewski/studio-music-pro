// Pulse language parser / validator (v1).
// Pure JS, no dependencies: runs in Node (server) and in the browser (editor).
//
// parse(source) => { ok, ast, errors, warnings }
// A broken line never throws: it is reported in `errors` with its 1-based line
// number so the editor can mark it and keep playing the last valid version.

import {
  INSTRUMENTS,
  DRUMS,
  WAVES,
  DEFAULT_WAVE,
  EFFECTS,
  MASTER_EFFECTS,
  GLOBALS,
  SCALES,
  LIMITS,
} from './spec.js';

const NOTE_RE = /^([a-g])(#|b)?(-?\d)$/;
const KEY_RE = /^([a-g])(#|b)?$/;

function stripComment(line) {
  // Comments start with "//" or "#" at the beginning of a token outside quotes.
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    if (!inQuote) {
      if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
      if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
  }
  return line;
}

// Splits a line into tokens, keeping "quoted strings" together (quotes removed).
function tokenize(line) {
  const tokens = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1] !== undefined) tokens.push({ type: 'string', value: m[1] });
    else tokens.push({ type: 'word', value: m[2] });
  }
  return tokens;
}

function parseNumber(str) {
  if (!/^-?\d+(\.\d+)?$/.test(str)) return null;
  return Number(str);
}

function parseEffects(tokens, startIdx, allowed, ctx) {
  const effects = [];
  let i = startIdx;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type !== 'word') {
      ctx.error(`Unexpected text "${t.value}" after the pattern`);
      return effects;
    }
    const name = t.value.toLowerCase();
    const def = EFFECTS[name];
    if (!def || (allowed && !allowed.includes(name))) {
      ctx.error(`Unknown effect "${t.value}"`);
      return effects;
    }
    const args = [];
    for (const spec of def.args) {
      const next = tokens[i + 1];
      if (spec.instrument) {
        if (!next || next.type !== 'word' || !INSTRUMENTS.includes(next.value.toLowerCase())) {
          ctx.error(`"${name}" needs an instrument name (e.g. ${name} kick)`);
          return effects;
        }
        args.push(next.value.toLowerCase());
        i++;
        continue;
      }
      const num = next && next.type === 'word' ? parseNumber(next.value) : null;
      if (num === null) {
        if (spec.optional) continue;
        ctx.error(`"${name}" needs a number between ${spec.min} and ${spec.max}`);
        return effects;
      }
      if (num < spec.min || num > spec.max) {
        ctx.error(`"${name}" value ${num} is out of range (${spec.min} to ${spec.max})`);
        return effects;
      }
      args.push(num);
      i++;
    }
    effects.push({ name, args });
    i++;
  }
  return effects;
}

function parseStep(raw, isDrum, ctx) {
  // Step grammar:  . | _ | x | NOTE | [NOTE NOTE ...]  followed by optional *N or ?
  let body = raw;
  let repeat = 1;
  let chance = 1;
  const mod = body.match(/^(.*?)(\*(\d+))?(\?)?$/);
  if (mod) {
    body = mod[1];
    if (mod[3]) repeat = Number(mod[3]);
    if (mod[4]) chance = 0.5;
  }
  if (repeat < 1 || repeat > LIMITS.maxRepeat) {
    ctx.error(`Repeat "*${repeat}" must be between 1 and ${LIMITS.maxRepeat}`);
    return null;
  }
  if (body === '.') return { kind: 'rest' };
  if (body === '_') return { kind: 'hold' };
  if (body === 'x') {
    if (!isDrum) {
      ctx.error('"x" is only valid for drum instruments; use notes like c2 or eb3');
      return null;
    }
    return { kind: 'hit', repeat, chance };
  }
  const noteMatches = (n) => NOTE_RE.test(n);
  let notes = null;
  if (body.startsWith('[') && body.endsWith(']')) {
    notes = body.slice(1, -1).split(',').join(' ').split(/\s+/).filter(Boolean);
  } else {
    notes = [body];
  }
  if (!notes.length || !notes.every(noteMatches)) {
    ctx.error(`Invalid step "${raw}". Use x, ., _, notes like c2 / eb3 / f#4 or chords like [c3,eb3,g3]`);
    return null;
  }
  if (isDrum) {
    ctx.error('Drum instruments use "x", "." and "_" (not notes)');
    return null;
  }
  return { kind: 'note', notes, repeat, chance };
}

// A pattern is written inside quotes with steps separated by spaces. Chords are
// written with commas inside brackets, e.g. "[a2,c3,e3] . . [g2,b2,d3]". For
// convenience, "[a2 c3 e3]" (spaces inside the brackets) is also accepted.
function splitPattern(str) {
  const steps = [];
  let cur = '';
  let depth = 0;
  for (const c of str) {
    if (c === '[') depth++;
    if (c === ']') depth = Math.max(0, depth - 1);
    if (/\s/.test(c) && depth === 0) {
      if (cur) steps.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur) steps.push(cur);
  return steps;
}

export function parse(source) {
  const errors = [];
  const warnings = [];
  const ast = {
    bpm: 120,
    swing: 0,
    key: null,
    loop: true,
    sections: [],
    master: [],
    mute: [],
    solo: [],
  };

  if (typeof source !== 'string') {
    return { ok: false, ast, errors: [{ line: 0, message: 'Source must be text' }], warnings };
  }

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > LIMITS.maxLines) {
    errors.push({ line: 0, message: `Too many lines (max ${LIMITS.maxLines})` });
    return { ok: false, ast, errors, warnings };
  }

  let current = null; // active section
  let implicit = null; // implicit section for tracks written before any `section`

  const ensureSection = () => {
    if (current) return current;
    if (!implicit) {
      implicit = { name: 'main', bars: 8, tracks: [], every: [], implicit: true, line: 0 };
      ast.sections.push(implicit);
    }
    return implicit;
  };

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const ctx = { error: (message) => errors.push({ line: lineNo, message }) };

    if (rawLine.length > LIMITS.maxLineLength) {
      ctx.error(`Line too long (max ${LIMITS.maxLineLength} characters)`);
      return;
    }

    const clean = stripComment(rawLine);
    if (!clean.trim()) return;

    const tokens = tokenize(clean.trim());
    const first = tokens[0];
    if (first.type !== 'word') {
      ctx.error('A line must start with a command or an instrument name');
      return;
    }
    const cmd = first.value.toLowerCase();

    // ---- global commands -------------------------------------------------
    if (cmd === 'bpm' || cmd === 'swing') {
      const num = tokens[1] && tokens[1].type === 'word' ? parseNumber(tokens[1].value) : null;
      const range = GLOBALS[cmd];
      if (num === null || tokens.length !== 2) {
        ctx.error(`Usage: ${cmd} <number>`);
        return;
      }
      if (num < range.min || num > range.max) {
        ctx.error(`${cmd} must be between ${range.min} and ${range.max}`);
        return;
      }
      ast[cmd] = num;
      return;
    }

    if (cmd === 'key') {
      const root = tokens[1] && tokens[1].value.toLowerCase();
      const scale = tokens[2] && tokens[2].value.toLowerCase();
      if (!root || !KEY_RE.test(root) || !SCALES.includes(scale) || tokens.length !== 3) {
        ctx.error('Usage: key <note> <major|minor>, e.g. key a minor');
        return;
      }
      ast.key = { root, scale };
      return;
    }

    if (cmd === 'loop') {
      const v = tokens[1] && tokens[1].value.toLowerCase();
      if (v !== 'on' && v !== 'off') {
        ctx.error('Usage: loop on | loop off');
        return;
      }
      ast.loop = v === 'on';
      return;
    }

    if (cmd === 'mute' || cmd === 'solo') {
      const names = tokens.slice(1).map((t) => t.value.toLowerCase());
      if (!names.length || !names.every((n) => INSTRUMENTS.includes(n))) {
        ctx.error(`Usage: ${cmd} <instrument> [instrument...]`);
        return;
      }
      ast[cmd].push(...names);
      return;
    }

    if (cmd === 'master') {
      const effects = parseEffects(tokens, 1, MASTER_EFFECTS, ctx);
      if (effects.length === 0 && tokens.length === 1) ctx.error('Usage: master <effect> <value>');
      ast.master.push(...effects);
      return;
    }

    // ---- sections --------------------------------------------------------
    if (cmd === 'section') {
      const name = tokens[1] && tokens[1].value;
      const bars = tokens[2] ? parseNumber(tokens[2].value) : null;
      if (!name || !/^[a-z][a-z0-9_-]{0,23}$/i.test(name) || bars === null || tokens.length !== 3) {
        ctx.error('Usage: section <name> <bars>, e.g. section drop 16');
        return;
      }
      if (!Number.isInteger(bars) || bars < 1 || bars > LIMITS.maxSectionBars) {
        ctx.error(`Section length must be a whole number between 1 and ${LIMITS.maxSectionBars} bars`);
        return;
      }
      if (ast.sections.length >= LIMITS.maxSections) {
        ctx.error(`Too many sections (max ${LIMITS.maxSections})`);
        return;
      }
      current = { name, bars, tracks: [], every: [], line: lineNo };
      ast.sections.push(current);
      return;
    }

    // ---- every N bars: <instrument> <effects> ---------------------------
    if (cmd === 'every') {
      const n = tokens[1] ? parseNumber(tokens[1].value) : null;
      const bars = tokens[2] && tokens[2].value.toLowerCase();
      const colon = tokens[3] && tokens[3].value === ':';
      // Accept "every 4 bars: lead ..." (colon glued to "bars") and "every 4 bars : lead ...".
      let rest;
      let barsWord = bars;
      if (barsWord && barsWord.endsWith(':')) {
        barsWord = barsWord.slice(0, -1);
        rest = 3;
      } else if (colon) {
        rest = 4;
      } else {
        rest = -1;
      }
      if (n === null || !Number.isInteger(n) || n < 1 || (barsWord !== 'bars' && barsWord !== 'bar') || rest < 0) {
        ctx.error('Usage: every <N> bars: <instrument> <effect> <value>');
        return;
      }
      const inst = tokens[rest] && tokens[rest].value.toLowerCase();
      if (!inst || !INSTRUMENTS.includes(inst)) {
        ctx.error('After "every N bars:" write an instrument name');
        return;
      }
      const effects = parseEffects(tokens, rest + 1, null, ctx);
      if (!effects.length) {
        ctx.error('Add at least one effect after the instrument');
        return;
      }
      ensureSection().every.push({ every: n, instrument: inst, effects, line: lineNo });
      return;
    }

    // ---- instrument tracks ----------------------------------------------
    if (INSTRUMENTS.includes(cmd)) {
      const patTok = tokens[1];
      if (!patTok || patTok.type !== 'string') {
        ctx.error(`${cmd} needs a pattern in quotes, e.g. ${cmd} "${DRUMS.includes(cmd) ? 'x . . .' : 'c2 . eb2 .'}"`);
        return;
      }
      const isDrum = DRUMS.includes(cmd);
      const stepStrs = splitPattern(patTok.value);
      if (!stepStrs.length) {
        ctx.error('The pattern is empty');
        return;
      }
      if (stepStrs.length > LIMITS.maxStepsPerPattern) {
        ctx.error(`Pattern too long (max ${LIMITS.maxStepsPerPattern} steps)`);
        return;
      }
      const steps = [];
      let bad = false;
      for (const s of stepStrs) {
        const step = parseStep(s, isDrum, ctx);
        if (!step) {
          bad = true;
          break;
        }
        steps.push(step);
      }
      if (bad) return;

      let idxTok = 2;
      let wave = DEFAULT_WAVE[cmd];
      if (tokens[idxTok] && tokens[idxTok].type === 'word' && WAVES.includes(tokens[idxTok].value.toLowerCase())) {
        wave = tokens[idxTok].value.toLowerCase();
        idxTok++;
      }
      const effects = parseEffects(tokens, idxTok, null, ctx);
      // parseEffects reports its own errors; if tokens remained unparsed, bail out.
      const consumed = effects.reduce((acc, e) => acc + 1 + e.args.length, 0);
      if (idxTok + consumed < tokens.length) return;

      const section = ensureSection();
      if (section.tracks.length >= LIMITS.maxTracksPerSection) {
        ctx.error(`Too many tracks in one section (max ${LIMITS.maxTracksPerSection})`);
        return;
      }
      section.tracks.push({ instrument: cmd, steps, wave, effects, line: lineNo });
      return;
    }

    ctx.error(`Unknown command "${first.value}"`);
  });

  // ---- cross-checks (sidechain targets, mute/solo targets) ---------------
  for (const section of ast.sections) {
    const present = new Set(section.tracks.map((t) => t.instrument));
    for (const track of section.tracks) {
      for (const fx of track.effects) {
        if (fx.name === 'sidechain' && !present.has(fx.args[0])) {
          warnings.push({
            line: track.line,
            message: `sidechain ${fx.args[0]}: there is no "${fx.args[0]}" in section "${section.name}"`,
          });
        }
      }
    }
    for (const ev of section.every) {
      if (!present.has(ev.instrument)) {
        warnings.push({
          line: ev.line,
          message: `every: there is no "${ev.instrument}" in section "${section.name}"`,
        });
      }
    }
  }

  if (!ast.sections.length) {
    warnings.push({ line: 0, message: 'The song has no instruments yet' });
  }

  return { ok: errors.length === 0, ast, errors, warnings };
}

// Convenience: first problem formatted for logs / AI retry prompts.
export function formatErrors(errors) {
  return errors.map((e) => (e.line ? `line ${e.line}: ${e.message}` : e.message)).join('\n');
}
