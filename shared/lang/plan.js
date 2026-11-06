// Pure scheduling logic for Pulse songs. No audio, no browser APIs: the audio
// engine asks "what happens in bar N?" and turns the answer into sound.
// Keeping this separate makes the musical rules testable in Node.

import { DRUMS } from './spec.js';

export const BEATS_PER_BAR = 4;

export function barSeconds(bpm) {
  return (BEATS_PER_BAR * 60) / bpm;
}

export function totalBars(ast) {
  return ast.sections.reduce((sum, s) => sum + s.bars, 0);
}

// Finds the section that plays at `barIndex` (0-based, counted from the start of the song).
// Returns null when the song has ended (loop off) or has no sections.
export function locate(ast, barIndex) {
  const total = totalBars(ast);
  if (!total) return null;
  let pos = barIndex;
  if (pos >= total) {
    if (!ast.loop) return null;
    pos %= total;
  }
  let start = 0;
  for (let i = 0; i < ast.sections.length; i++) {
    const section = ast.sections[i];
    if (pos < start + section.bars) {
      return { section, sectionIndex: i, barInSection: pos - start, songBar: pos };
    }
    start += section.bars;
  }
  return null;
}

// Deterministic pseudo-random number in [0, 1) so that "x?" steps behave the
// same in the live preview, the mix render and every stem render.
export function chanceValue(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Which instruments are audible given the song's own mute/solo commands plus live overrides.
export function audibleSet(ast, overrides = {}) {
  const solo = new Set([...(ast.solo ?? []), ...(overrides.solo ?? [])]);
  const mute = new Set([...(ast.mute ?? []), ...(overrides.mute ?? [])]);
  return (instrument) => (solo.size ? solo.has(instrument) : !mute.has(instrument));
}

// Events of one track inside one bar.
// `position` is the fraction of the bar (0 to 1) where the step starts.
export function planTrack(track, trackIndex, songBar) {
  const n = track.steps.length;
  const isDrum = DRUMS.includes(track.instrument);
  const events = [];
  for (let i = 0; i < n; i++) {
    const step = track.steps[i];
    if (step.kind === 'rest' || step.kind === 'hold') continue;
    if (step.chance < 1 && chanceValue(trackIndex + 1, songBar + 1, i + 1) >= step.chance) continue;

    // A trigger lasts until the next trigger or rest, extended by "_" holds that follow it.
    let length = 1;
    if (!isDrum) {
      while (i + length < n && track.steps[i + length].kind === 'hold') length++;
    }
    events.push({
      step: i,
      steps: n,
      position: i / n,
      length: length / n, // fraction of the bar
      swingable: i % 2 === 1,
      kind: step.kind, // 'hit' | 'note'
      notes: step.notes ?? [],
      repeat: step.repeat ?? 1,
    });
  }
  return events;
}

// Per-instrument effect overrides active in this bar ("every N bars: ...").
// Returns Map<instrument, Array<{name,args}>>.
export function activeEvery(section, barInSection) {
  const out = new Map();
  for (const rule of section.every ?? []) {
    if ((barInSection + 1) % rule.every === 0) {
      out.set(rule.instrument, [...(out.get(rule.instrument) ?? []), ...rule.effects]);
    }
  }
  return out;
}

// Stable identity of a track's sound design. Two tracks with the same signature can share one audio chain.
export function trackSignature(track, section) {
  const everyFx = (section.every ?? []).filter((r) => r.instrument === track.instrument).flatMap((r) => r.effects.map((e) => e.name));
  return JSON.stringify([track.instrument, track.wave, track.effects, [...new Set(everyFx)].sort()]);
}

// Stable identity of a spoken clip (what is said, by whom, how). Same on the server (cache) and in the browser.
export function voiceKey(v) {
  return JSON.stringify([v.voice, v.style ?? '', v.text]);
}

// Every distinct clip of the song, in order.
export function songVoices(ast) {
  const seen = new Map();
  for (const section of ast.sections) {
    for (const v of section.voices ?? []) {
      const key = voiceKey(v);
      if (!seen.has(key)) seen.set(key, { key, text: v.text, voice: v.voice, style: v.style, line: v.line });
    }
  }
  return [...seen.values()];
}

// Names of the distinct instruments that appear anywhere in the song (used for stems).
export function songInstruments(ast) {
  const seen = [];
  for (const section of ast.sections) {
    for (const track of section.tracks) {
      if (!seen.includes(track.instrument)) seen.push(track.instrument);
    }
  }
  // Spoken clips count as one more "instrument" so they can be muted, soloed and exported as a stem.
  if (ast.sections.some((s) => (s.voices ?? []).length)) seen.push('voice');
  return seen;
}
