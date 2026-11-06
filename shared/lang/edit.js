// Text-level edits of Pulse code. The visual controls (tempo, mixer sliders, step grid, transpose)
// use these functions, so every click ends up as a readable change in the code. That is how a
// beginner learns the language: move a slider, watch which line changes.
//
// All functions are pure: they take the source text and return the new source text.

import { WAVES } from './spec.js';

const TRACK_RE = /^(\s*)([a-z]+)(\s+)"([^"]*)"(.*)$/;
const SECTION_RE = /^\s*section\s+(\S+)\s+\d+/;
const NOTE_RE = /^([a-g])([#b]?)(-?\d)$/;
const SHARP_NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const SEMITONE = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function splitPattern(str) {
  const steps = [];
  let cur = '';
  let depth = 0;
  for (const c of str) {
    if (c === '[') depth++;
    if (c === ']') depth = Math.max(0, depth - 1);
    if (/\s/.test(c) && depth === 0) {
      if (cur) steps.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur) steps.push(cur);
  return steps;
}

export const joinPattern = (steps) => steps.join(' ');

export function fmt(n) {
  if (Math.abs(n) >= 100) return String(Math.round(n));
  return String(Math.round(n * 100) / 100);
}

function lines(code) {
  return code.replace(/\r\n?/g, '\n').split('\n');
}

// Calls fn(lineIndex, parsed) for each track line of `instrument` (optionally only in one section).
function eachTrack(arr, instrument, section, fn) {
  let current = null;
  arr.forEach((text, i) => {
    const sec = SECTION_RE.exec(text);
    if (sec) current = sec[1];
    const m = TRACK_RE.exec(text);
    if (!m || !(m[2] === instrument || (instrument === 'voice' && m[2] === 'mic'))) return;
    if (section && current !== section) return;
    fn(i, { indent: m[1], gap: m[3], pattern: m[4], tail: m[5] });
  });
}

const build = (p) => `${p.indent}${p.instrument}${p.gap}"${p.pattern}"${p.tail}`;

function mutateTracks(code, instrument, section, change) {
  const arr = lines(code);
  eachTrack(arr, instrument, section, (i, p) => {
    const next = change({ ...p, instrument });
    arr[i] = build({ ...p, ...next, instrument });
  });
  return arr.join('\n');
}

// ---- global settings ------------------------------------------------------------------
export function setGlobal(code, name, value) {
  const line = `${name} ${fmt(value)}`;
  const re = new RegExp(`^(\\s*)${name}\\s+\\S+.*$`, 'm');
  if (re.test(code)) return code.replace(re, `$1${line}`);
  // Insert after the leading comment block, before everything else.
  const arr = lines(code);
  let at = 0;
  while (at < arr.length && /^\s*(\/\/.*)?$/.test(arr[at]) && arr[at].trim() !== '') at++;
  arr.splice(at, 0, line);
  return arr.join('\n');
}

export function removeGlobal(code, name) {
  return code.replace(new RegExp(`^\\s*${name}\\s+\\S+.*\\n?`, 'm'), '');
}

// ---- effects and wave ------------------------------------------------------------------
// value === null removes the effect.
export function setTrackEffect(code, instrument, effect, value, { section = null } = {}) {
  return mutateTracks(code, instrument, section, (p) => {
    const tokens = p.tail.trim() ? p.tail.trim().split(/\s+/) : [];
    const at = tokens.indexOf(effect);
    if (at >= 0) {
      if (value === null) tokens.splice(at, 2);
      else tokens[at + 1] = fmt(value);
    } else if (value !== null) {
      tokens.push(effect, fmt(value));
    }
    return { tail: tokens.length ? ' ' + tokens.join(' ') : '' };
  });
}

export function setTrackWave(code, instrument, wave, { section = null } = {}) {
  if (!WAVES.includes(wave)) return code;
  return mutateTracks(code, instrument, section, (p) => {
    const tokens = p.tail.trim() ? p.tail.trim().split(/\s+/) : [];
    if (tokens.length && WAVES.includes(tokens[0])) tokens[0] = wave;
    else tokens.unshift(wave);
    return { tail: ' ' + tokens.join(' ') };
  });
}

// Raw step tokens of the track on a 1-based line ("x", ".", "c3*2", "[a2,c3,e3]"...), or null.
export function getSteps(code, lineNo) {
  const m = TRACK_RE.exec(lines(code)[lineNo - 1] ?? '');
  return m ? splitPattern(m[4]) : null;
}

// ---- patterns ----------------------------------------------------------------------------
// Replaces one step of the track on a given 1-based line. `token` is "x", ".", "_", "c3", "[c3,e3,g3]"...
export function setStep(code, lineNo, stepIndex, token) {
  const arr = lines(code);
  const m = TRACK_RE.exec(arr[lineNo - 1] ?? '');
  if (!m) return code;
  const steps = splitPattern(m[4]);
  if (stepIndex < 0 || stepIndex >= steps.length) return code;
  steps[stepIndex] = token;
  arr[lineNo - 1] = `${m[1]}${m[2]}${m[3]}"${joinPattern(steps)}"${m[5]}`;
  return arr.join('\n');
}

// Resizes a pattern to 4, 8, 16 or 32 steps, repeating or truncating it.
export function resizePattern(code, lineNo, count) {
  const arr = lines(code);
  const m = TRACK_RE.exec(arr[lineNo - 1] ?? '');
  if (!m) return code;
  const steps = splitPattern(m[4]);
  const out = [];
  for (let i = 0; i < count; i++) out.push(i < steps.length ? steps[i] : '.');
  arr[lineNo - 1] = `${m[1]}${m[2]}${m[3]}"${joinPattern(out)}"${m[5]}`;
  return arr.join('\n');
}

// ---- transposing ---------------------------------------------------------------------------
export function transposeNote(note, semitones) {
  const m = NOTE_RE.exec(note);
  if (!m) return note;
  const midi = Number(m[3]) * 12 + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + semitones;
  const oct = Math.floor(midi / 12);
  if (oct < 0 || oct > 8) return note; // keep it inside a sane range
  return SHARP_NAMES[((midi % 12) + 12) % 12] + oct;
}

function transposeStep(step, semitones) {
  const m = /^(.*?)(\*\d+)?(\?)?$/.exec(step);
  const body = m[1];
  const suffix = (m[2] ?? '') + (m[3] ?? '');
  if (body.startsWith('[') && body.endsWith(']')) {
    const notes = body.slice(1, -1).split(/[,\s]+/).filter(Boolean).map((n) => transposeNote(n, semitones));
    return `[${notes.join(',')}]${suffix}`;
  }
  return NOTE_RE.test(body) ? transposeNote(body, semitones) + suffix : step;
}

export function transposeTrack(code, instrument, semitones, { section = null, lineNo = null } = {}) {
  const arr = lines(code);
  eachTrack(arr, instrument, section, (i, p) => {
    if (lineNo && i + 1 !== lineNo) return;
    const steps = splitPattern(p.pattern).map((s) => transposeStep(s, semitones));
    arr[i] = `${p.indent}${instrument}${p.gap}"${joinPattern(steps)}"${p.tail}`;
  });
  return arr.join('\n');
}

// ---- scale helpers for the step editor ------------------------------------------------------
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// Notes of the song's key between two octaves, e.g. scaleNotes('a','minor',1,3).
export function scaleNotes(root, mode, fromOct, toOct) {
  const base = SEMITONE[root[0]] + (root[1] === '#' ? 1 : root[1] === 'b' ? -1 : 0);
  const degrees = mode === 'major' ? MAJOR : MINOR;
  const out = [];
  for (let o = fromOct; o <= toOct; o++) {
    for (const d of degrees) {
      const midi = o * 12 + base + d;
      out.push(SHARP_NAMES[midi % 12] + Math.floor(midi / 12));
    }
  }
  return out;
}

// Adds `text` as a new line at the end of a section (after its last non-blank line).
// With no section name (or an unknown one) it goes at the end of the song.
export function insertLineInSection(code, sectionName, text) {
  const arr = lines(code);
  let start = -1;
  if (sectionName) {
    start = arr.findIndex((l) => {
      const m = SECTION_RE.exec(l);
      return m && m[1] === sectionName;
    });
  }
  let end = arr.length;
  if (start >= 0) {
    for (let i = start + 1; i < arr.length; i++) {
      if (SECTION_RE.test(arr[i])) {
        end = i;
        break;
      }
    }
  }
  let at = end;
  while (at > 0 && arr[at - 1].trim() === '') at--;
  const indent = start >= 0 || arr.some((l) => SECTION_RE.test(l)) ? '  ' : '';
  arr.splice(at, 0, indent + text);
  return arr.join('\n');
}

// Removes one line (1-based line number).
export function removeLine(code, lineNo) {
  const arr = lines(code);
  if (lineNo < 1 || lineNo > arr.length) return code;
  arr.splice(lineNo - 1, 1);
  return arr.join('\n');
}
