// Constructor guiado de prompts: convierte un conjunto de clics (más texto libre opcional) en un prompt preciso.
// Es una función pura, la usa el navegador (vista previa en vivo) y la cubren los tests.

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

// Instrumentos agrupados como los piensa un productor (los usan el constructor y el mezclador).
export const INSTRUMENT_GROUPS = [
  { id: 'percussion', label: 'Percussion', items: ['kick', 'snare', 'clap', 'hat', 'openhat', 'perc'] },
  { id: 'bass', label: 'Bass', items: ['bass', 'sub'] },
  { id: 'mids', label: 'Mids (harmony)', items: ['pad', 'strings', 'organ', 'keys', 'stab', 'pluck', 'arp'] },
  { id: 'lead', label: 'Lead (melody)', items: ['lead', 'synth', 'bell'] },
];
export const groupOf = (instrument) => (instrument === 'voice' ? 'voice' : INSTRUMENT_GROUPS.find((g) => g.items.includes(instrument))?.id ?? 'other');

// Cambios de un clic para "Edit current". Están redactados como instrucciones sobre la canción existente.
export const EDIT_GROUPS = [
  { id: 'tempo', label: 'Tempo & feel', icon: '⏱' },
  { id: 'tone', label: 'Tone', icon: '🎛' },
  { id: 'space', label: 'Space & width', icon: '🌌' },
  { id: 'structure', label: 'Structure', icon: '🧱' },
  { id: 'parts', label: 'Parts & sounds', icon: '🎹' },
];
export const STRENGTHS = [
  { id: 'subtle', label: 'Subtle', text: 'subtle (small, careful changes)' },
  { id: 'normal', label: 'Normal', text: 'normal' },
  { id: 'strong', label: 'Strong', text: 'strong (bold, obvious changes)' },
];
export const QUICK_EDITS = [
  { id: 'faster', group: 'tempo', icon: '⏩', label: 'Faster', text: 'raise the tempo by about 8 bpm' },
  { id: 'slower', group: 'tempo', icon: '⏪', label: 'Slower', text: 'lower the tempo by about 10 bpm' },
  { id: 'more-groove', group: 'tempo', icon: '🕺', label: 'More groove', text: 'add swing and variation so it grooves more' },
  { id: 'halftime', group: 'tempo', icon: '🐌', label: 'Half-time feel', text: 'make the drums feel half-time (snare on beat 3) without changing the bpm' },
  { id: 'heavier-bass', group: 'tone', icon: '🔊', label: 'Heavier bass', text: 'make the bass heavier: lower its lowpass, add a sub if missing, add some distortion' },
  { id: 'lighter-bass', group: 'tone', icon: '🪶', label: 'Lighter bass', text: 'make the bass lighter and shorter, raise its lowpass, lower its volume' },
  { id: 'brighter', group: 'tone', icon: '☀️', label: 'Brighter', text: 'make it brighter: raise the lowpass values and add a little hi-hat energy' },
  { id: 'darker', group: 'tone', icon: '🌑', label: 'Darker', text: 'make it darker: lower the lowpass values and use minor, low voicings' },
  { id: 'softer-mids', group: 'tone', icon: '🧈', label: 'Softer mids', text: 'make the mids smoother and less harsh: lower the lowpass on pads, leads, plucks and stabs, lower their volume, avoid notes above octave 5' },
  { id: 'punchier', group: 'tone', icon: '🥊', label: 'Punchier drums', text: 'make the drums punchier: louder kick and snare, tighter hats, a little distortion on the snare' },
  { id: 'more-space', group: 'space', icon: '🏔', label: 'More space', text: 'add more reverb and delay to pads, leads and percussion' },
  { id: 'drier', group: 'space', icon: '🏜', label: 'Drier', text: 'reduce reverb and delay so the mix feels tighter and drier' },
  { id: 'wider', group: 'space', icon: '↔️', label: 'Wider stereo', text: 'widen the stereo image by panning hats, percussion and arps' },
  { id: 'automation', group: 'space', icon: '🌊', label: 'More movement', text: 'add "every N bars" automation: filter sweeps, delay throws and panning' },
  { id: 'add-intro', group: 'structure', icon: '🚪', label: 'Add intro', text: 'add a short intro that introduces the elements one by one' },
  { id: 'add-build', group: 'structure', icon: '📈', label: 'Add build-up', text: 'add a build-up section before the main groove (rising filter, snare roll, riser feel)' },
  { id: 'add-drop', group: 'structure', icon: '💥', label: 'Add drop', text: 'add a big drop section with every main instrument playing' },
  { id: 'add-break', group: 'structure', icon: '🫧', label: 'Add breakdown', text: 'add a breakdown section with only pad and melody and no kick' },
  { id: 'add-outro', group: 'structure', icon: '🌅', label: 'Add outro', text: 'add an outro that removes elements one by one' },
  { id: 'simplify', group: 'structure', icon: '✂️', label: 'Simplify', text: 'simplify: remove one or two instruments and thin out busy patterns' },
  { id: 'more-variation', group: 'structure', icon: '🎲', label: 'More variation', text: 'make every section clearly different from the previous one: change patterns, filters and which instruments play' },
  { id: 'new-melody', group: 'parts', icon: '🎶', label: 'New melody', text: 'write a new lead melody, keep the key' },
  { id: 'new-bassline', group: 'parts', icon: '🎸', label: 'New bass line', text: 'write a new bass line that follows the chords, keep the key' },
  { id: 'new-chords', group: 'parts', icon: '🎼', label: 'New chords', text: 'write a new chord progression for the pads and stabs, keep the key' },
  { id: 'more-drums', group: 'parts', icon: '🥁', label: 'Busier drums', text: 'make the drum patterns busier: more hats, ghost notes on snare, a perc line' },
  { id: 'add-keys', group: 'parts', icon: '🎹', label: 'Add keys', text: 'add a "keys" part with soft chords in the main section' },
  { id: 'add-organ', group: 'parts', icon: '⛪', label: 'Add organ bubble', text: 'add an "organ" playing short chords on the off-beats' },
  { id: 'add-stabs', group: 'parts', icon: '⚡', label: 'Add stabs', text: 'add a "stab" instrument with short punchy chords' },
  { id: 'add-strings', group: 'parts', icon: '🎻', label: 'Add strings', text: 'add a slow "strings" part with long chords' },
  { id: 'add-bell', group: 'parts', icon: '🔔', label: 'Add bell melody', text: 'add a sparse "bell" melody in a high octave' },
  { id: 'swap-lead', group: 'parts', icon: '🔁', label: 'Swap lead sound', text: 'replace the lead instrument with a different one (for example synth, keys, bell or pluck) and keep the melody' },
];


// Puntos de partida listos: completan los clics, eligen el estilo y escriben una descripción que se puede seguir editando.
export const PRESETS = [
  { id: 'reggae-dub', label: 'Reggae dub', style: 'dub', text: 'Slow one drop with deep bass and delay on the skank', moods: ['warm', 'hypnotic'], energy: 'chill', structure: 'track', instruments: ['kick', 'snare', 'hat', 'perc', 'bass', 'pad'], bass: 'deep', fx: ['dub-echo', 'big-reverb'], feel: 'swing' },
  { id: 'dark-techno', label: 'Dark techno', style: 'techno', text: 'Hypnotic rumbling bass, relentless kick, sparse stabs', moods: ['dark', 'hypnotic'], energy: 'high', structure: 'track', instruments: ['kick', 'clap', 'hat', 'openhat', 'perc', 'bass'], bass: 'rolling', fx: ['sidechain', 'filter-sweeps'] },
  { id: 'liquid-dnb', label: 'Liquid drum & bass', style: 'drum-and-bass', text: 'Liquid drum and bass with a soft pad and a warm rolling bass', moods: ['warm', 'dreamy'], energy: 'medium', structure: 'drop', instruments: ['kick', 'snare', 'hat', 'bass', 'pad', 'pluck'], bass: 'rolling', fx: ['big-reverb'] },
  { id: 'deep-house', label: 'Deep house', style: 'deep-house', text: 'Late-night deep house with soft chords and a round bass', moods: ['warm', 'minimal'], energy: 'medium', structure: 'track', instruments: ['kick', 'clap', 'hat', 'openhat', 'bass', 'pad', 'pluck'], bass: 'offbeat', fx: ['sidechain'], feel: 'swing' },
  { id: 'acid-techno', label: 'Acid techno', style: 'techno', text: 'Squelchy acid line over a driving kick', moods: ['aggressive', 'hypnotic'], energy: 'high', structure: 'track', instruments: ['kick', 'clap', 'hat', 'bass', 'arp'], bass: 'acid', fx: ['filter-sweeps'] },
  { id: 'uplifting-trance', label: 'Uplifting trance', style: 'trance', text: 'Euphoric trance with a big arp, a long build-up and an emotional lead', moods: ['euphoric'], energy: 'high', structure: 'drop', instruments: ['kick', 'clap', 'hat', 'openhat', 'bass', 'pad', 'lead', 'arp'], bass: 'offbeat', fx: ['sidechain', 'big-reverb'] },
  { id: 'psytrance', label: 'Psytrance', style: 'psytrance', text: 'Fast psychedelic rolling bass with twisting arps', moods: ['hypnotic', 'aggressive'], energy: 'high', structure: 'track', instruments: ['kick', 'hat', 'openhat', 'bass', 'arp', 'lead'], bass: 'rolling', fx: ['filter-sweeps', 'stereo'] },
  { id: 'dubstep', label: 'Heavy dubstep', style: 'dubstep', text: 'Half-time drums, huge wobbling bass in the drop', moods: ['dark', 'aggressive'], energy: 'high', structure: 'drop', instruments: ['kick', 'snare', 'hat', 'sub', 'bass', 'lead'], bass: 'deep', fx: ['filter-sweeps'] },
  { id: 'uk-garage', label: 'UK garage', style: 'uk-garage', text: 'Skippy 2-step drums, shuffled hats and a warm sub', moods: ['playful', 'warm'], energy: 'medium', structure: 'track', instruments: ['kick', 'snare', 'hat', 'perc', 'sub', 'pad'], bass: 'deep', feel: 'shuffle' },
  { id: 'lofi', label: 'Lo-fi study', style: 'lofi', text: 'Dusty lo-fi beat with mellow chords for studying', moods: ['warm', 'melancholic'], energy: 'chill', structure: 'loop', instruments: ['kick', 'snare', 'hat', 'bass', 'pad', 'pluck'], bass: 'melodic', fx: ['lofi'], feel: 'swing' },
  { id: 'synthwave', label: 'Synthwave', style: 'synthwave', text: 'Retro night drive with gated snare, pulsing bass and a bright lead', moods: ['cinematic', 'euphoric'], energy: 'medium', structure: 'track', instruments: ['kick', 'snare', 'hat', 'bass', 'pad', 'lead', 'arp'], bass: 'rolling', fx: ['big-reverb'] },
  { id: 'ambient', label: 'Ambient', style: 'ambient', text: 'Slow evolving pads, no drums, lots of space', moods: ['dreamy', 'cinematic'], energy: 'chill', structure: 'track', instruments: ['pad', 'pluck', 'sub'], fx: ['big-reverb', 'filter-sweeps'] },
  { id: 'trap', label: 'Trap', style: 'trap', text: 'Hard 808 bass, rolling hats and a dark melody', moods: ['dark'], energy: 'high', structure: 'track', instruments: ['kick', 'snare', 'hat', 'sub', 'pluck'], bass: 'deep' },
  { id: 'hardstyle', label: 'Hardstyle', style: 'hardstyle', text: 'Distorted reverse-bass kick with a screeching lead', moods: ['aggressive', 'euphoric'], energy: 'high', structure: 'drop', instruments: ['kick', 'clap', 'hat', 'bass', 'lead'], bass: 'deep' },
  { id: 'breakbeat', label: 'Breakbeat', style: 'breakbeat', text: 'Chopped breakbeat with a funky bass line', moods: ['playful'], energy: 'medium', structure: 'track', instruments: ['kick', 'snare', 'hat', 'perc', 'bass', 'pluck'], bass: 'melodic', feel: 'swing' },
  { id: 'jungle', label: 'Jungle', style: 'jungle', text: 'Fast chopped breaks with a deep reggae-style sub', moods: ['dark', 'playful'], energy: 'high', structure: 'track', instruments: ['kick', 'snare', 'hat', 'perc', 'sub'], bass: 'deep', fx: ['dub-echo'] },
];

export function emptySelection() {
  return {
    moods: [], bpm: null, keyRoot: '', keyScale: 'minor', energy: '', structure: '',
    instruments: [], bass: '', feel: 'straight', fx: [], edits: [], strength: 'normal',
    voice: { on: false, gender: 'female', text: '', style: '', aiLyrics: false, lang: 'English' },
  };
}

const pick = (list, id) => list.find((x) => x.id === id);
const oneLine = (s) => String(s ?? '').replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

// Devuelvo el prompt final. `styleName` se le muestra a la IA como primera línea.
export function composePrompt(sel, freeText = '', { styleName = '', mode = 'new' } = {}) {
  const parts = [];
  const editing = mode === 'edit';
  if (styleName) parts.push(editing ? `Style context: ${styleName}.` : `Style: ${styleName}.`);
  if (sel.moods?.length) parts.push(`Mood: ${sel.moods.join(', ')}.`);
  const bpm = Number(sel.bpm);
  if (bpm >= 40 && bpm <= 240) parts.push(`Tempo: ${Math.round(bpm)} bpm.`);
  if (sel.keyRoot) parts.push(`Key: ${sel.keyRoot} ${sel.keyScale === 'major' ? 'major' : 'minor'} (write "key ${sel.keyRoot} ${sel.keyScale === 'major' ? 'major' : 'minor'}" and keep every melodic note in that scale).`);
  const energy = pick(ENERGIES, sel.energy);
  if (energy) parts.push(`Energy: ${energy.text}.`);
  const structure = pick(STRUCTURES, sel.structure);
  if (structure && !editing) parts.push(`Structure: ${structure.text}.`); // en modo edición uso los cambios rápidos (agregar build-up, agregar drop...)
  const inst = (sel.instruments ?? []).filter((i) => INSTRUMENTS.includes(i));
  if (inst.length) parts.push(editing ? `Make sure these instruments are present and audible: ${inst.join(', ')}.` : `Use these instruments: ${inst.join(', ')}.`);
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
  const edits = (sel.edits ?? []).map((id) => pick(QUICK_EDITS, id)).filter(Boolean);
  if (edits.length) parts.push(`Changes to make: ${edits.map((e) => e.text).join('; ')}.`);
  if (edits.length && editing) { const st = pick(STRENGTHS, sel.strength); if (st && st.id !== 'normal') parts.push(`Strength of the changes: ${st.text}.`); }
  if (editing && parts.length) parts.unshift('Apply the following changes to the current song and keep everything else the same (sections, patterns, key, tempo) unless a change says otherwise.');
  const extra = String(freeText ?? '').trim();
  if (extra) parts.push(`${parts.length ? 'Extra details from the user: ' : ''}${extra}`);
  return parts.join('\n');
}

export function selectionIsEmpty(sel) {
  return !composePrompt(sel).trim();
}
