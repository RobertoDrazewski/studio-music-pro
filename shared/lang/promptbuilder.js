// Guided prompt builder: turns a set of clicks (plus optional free text) into one precise prompt.
// Pure function, used by the browser (live preview) and covered by tests.

import { INSTRUMENTS, LIMITS, VOICES } from './spec.js';

export const MOODS = ['dark', 'warm', 'euphoric', 'melancholic', 'hypnotic', 'aggressive', 'dreamy', 'playful', 'minimal', 'cinematic'];
export const ENERGIES = [
  { id: 'chill', label: 'Chill', text: 'low energy, relaxed, lots of space, few instruments playing at once' },
  { id: 'medium', label: 'Medium', text: 'medium energy, steady groove' },
  { id: 'high', label: 'High', text: 'high energy, dense and driving, big impact in the main section' },
];
export const STRUCTURES = [
  { id: 'loop', label: 'Short loop', text: 'a short loop idea: 2 sections, about 16 bars in total' },
  { id: 'track', label: 'Full track', text: 'a full track: intro, build, main groove, variation or break, and outro; at least 4 sections and 48 bars' },
  { id: 'drop', label: 'With drop', text: 'a track with a clear build-up (rising filter, snare roll or riser feel) followed by a big drop, and a breakdown with only pad and melody before it; at least 5 sections and 64 bars' },
];
export const BASS_TYPES = [
  { id: 'deep', label: 'Deep sub', text: 'deep, round sub bass with long held notes' },
  { id: 'rolling', label: 'Rolling', text: 'rolling, constant 16th/8th bass line that drives the track' },
  { id: 'offbeat', label: 'Offbeat', text: 'bass played on the off-beats between the kicks' },
  { id: 'acid', label: 'Acid', text: 'acid-style squelchy bass with a resonant, moving lowpass and short notes' },
  { id: 'melodic', label: 'Melodic', text: 'melodic bass line that follows a simple chord progression' },
];
export const FEELS = [
  { id: 'straight', label: 'Straight', text: '', swing: 0 },
  { id: 'swing', label: 'Light swing', text: 'light swing (swing 0.15)', swing: 0.15 },
  { id: 'shuffle', label: 'Heavy shuffle', text: 'heavy shuffle feel (swing 0.3)', swing: 0.3 },
];
export const FX_CHOICES = [
  { id: 'dub-echo', label: 'Dub echo', text: 'dub-style delay throws on the off-beat hits and the skank' },
  { id: 'big-reverb', label: 'Big reverb', text: 'large reverb on the pad and lead for a wide space' },
  { id: 'filter-sweeps', label: 'Filter sweeps', text: 'slow filter sweeps with "every N bars" on the main synth' },
  { id: 'sidechain', label: 'Sidechain pump', text: 'sidechain the bass and pad to the kick for a pumping feel' },
  { id: 'lofi', label: 'Lo-fi', text: 'lo-fi texture: low-passed, a little bitcrush and distortion on drums' },
  { id: 'stereo', label: 'Wide stereo', text: 'wide stereo image: pan hats, percussion and arps to opposite sides' },
];
export const KEY_ROOTS = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
export const KEY_SCALES = ['minor', 'major'];

export function emptySelection() {
  return {
    moods: [], bpm: null, keyRoot: '', keyScale: 'minor', energy: '', structure: '',
    instruments: [], bass: '', feel: 'straight', fx: [],
    voice: { on: false, gender: 'female', text: '', style: '', aiLyrics: false, lang: 'English' },
  };
}

const pick = (list, id) => list.find((x) => x.id === id);
const oneLine = (s) => String(s ?? '').replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// Returns the final prompt. `styleName` is shown to the AI as the first line.
export function composePrompt(sel, freeText = '', { styleName = '' } = {}) {
  const parts = [];
  if (styleName) parts.push(`Style: ${styleName}.`);
  if (sel.moods?.length) parts.push(`Mood: ${sel.moods.join(', ')}.`);
  const bpm = Number(sel.bpm);
  if (bpm >= 40 && bpm <= 240) parts.push(`Tempo: ${Math.round(bpm)} bpm.`);
  if (sel.keyRoot) parts.push(`Key: ${sel.keyRoot} ${sel.keyScale === 'major' ? 'major' : 'minor'} (write "key ${sel.keyRoot} ${sel.keyScale === 'major' ? 'major' : 'minor'}" and keep every melodic note in that scale).`);
  const energy = pick(ENERGIES, sel.energy);
  if (energy) parts.push(`Energy: ${energy.text}.`);
  const structure = pick(STRUCTURES, sel.structure);
  if (structure) parts.push(`Structure: ${structure.text}.`);
  const inst = (sel.instruments ?? []).filter((i) => INSTRUMENTS.includes(i));
  if (inst.length) parts.push(`Use these instruments: ${inst.join(', ')}.`);
  const bass = pick(BASS_TYPES, sel.bass);
  if (bass) parts.push(`Bass: ${bass.text}.`);
  const feel = pick(FEELS, sel.feel);
  if (feel?.text) parts.push(`Feel: ${feel.text}.`);
  const fx = (sel.fx ?? []).map((id) => pick(FX_CHOICES, id)).filter(Boolean);
  if (fx.length) parts.push(`Sound design: ${fx.map((f) => f.text).join('; ')}.`);
  const v = sel.voice;
  if (v?.on && v.aiLyrics && oneLine(v.text) && VOICES.includes(v.gender)) {
    parts.push(
      `Voice: write short original lyrics in ${oneLine(v.lang) || 'English'} about "${oneLine(v.text).slice(0, 80)}". ` +
      `Use 2 to 4 "voice" lines of at most 8 words each (${v.gender}), on different bars of the main sections, ` +
      'with style "rhythmic, half-sung chant, melodic". The voice is spoken or chanted by a text-to-speech service, not truly sung.',
    );
  } else if (v?.on && oneLine(v.text) && VOICES.includes(v.gender)) {
    const tone = oneLine(v.style);
    parts.push(`Voice: add exactly one spoken line: voice "${oneLine(v.text).slice(0, LIMITS.maxVoiceChars)}" ${v.gender}${tone ? ` style "${tone.slice(0, LIMITS.maxVoiceStyleChars)}"` : ''}, placed in the main section.`);
  }
  const extra = String(freeText ?? '').trim();
  if (extra) parts.push(`${parts.length ? 'Extra details from the user: ' : ''}${extra}`);
  return parts.join('\n');
}

export function selectionIsEmpty(sel) {
  return !composePrompt(sel).trim();
}
