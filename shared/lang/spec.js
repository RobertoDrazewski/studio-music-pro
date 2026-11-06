// Single source of truth for the Pulse language (v1).
// Used by the parser, by the AI system prompt and (later) by the web editor
// for autocompletion and syntax highlighting.

export const DRUMS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'perc'];
export const MELODIC = ['bass', 'sub', 'pad', 'lead', 'pluck', 'arp'];
export const INSTRUMENTS = [...DRUMS, ...MELODIC];

export const WAVES = ['sine', 'saw', 'square', 'tri', 'noise'];

export const DEFAULT_WAVE = {
  kick: 'sine',
  snare: 'noise',
  clap: 'noise',
  hat: 'noise',
  openhat: 'noise',
  perc: 'tri',
  bass: 'saw',
  sub: 'sine',
  pad: 'saw',
  lead: 'square',
  pluck: 'tri',
  arp: 'square',
};

// Effect definitions: number of numeric args (min..max) and allowed range.
// `optional: true` means the argument can be omitted.
export const EFFECTS = {
  lowpass: { args: [{ min: 20, max: 20000 }] },
  highpass: { args: [{ min: 20, max: 20000 }] },
  bandpass: { args: [{ min: 20, max: 20000 }] },
  delay: { args: [{ min: 0, max: 1 }] },
  reverb: { args: [{ min: 0, max: 1 }] },
  distort: { args: [{ min: 0, max: 1 }] },
  bitcrush: { args: [{ min: 1, max: 16 }] },
  chorus: { args: [{ min: 0, max: 1, optional: true }] },
  phaser: { args: [{ min: 0, max: 1, optional: true }] },
  vol: { args: [{ min: 0, max: 1.5 }] },
  pan: { args: [{ min: -1, max: 1 }] },
  sidechain: { args: [{ instrument: true }] },
};

// Effects allowed on the master bus.
export const MASTER_EFFECTS = ['lowpass', 'highpass', 'reverb', 'delay', 'distort', 'vol'];

export const GLOBALS = {
  bpm: { min: 40, max: 240 },
  swing: { min: 0, max: 0.75 },
};

export const NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
export const SCALES = ['major', 'minor'];

export const LIMITS = {
  maxLines: 400,
  maxLineLength: 300,
  maxSectionBars: 128,
  maxStepsPerPattern: 64,
  maxRepeat: 8,
  maxSections: 16,
  maxTracksPerSection: 16,
  maxVoices: 8,
  maxVoiceChars: 200,
  maxVoiceStyleChars: 120,
};

// Spoken voice clips ("voice" command): generated with the OpenAI speech API.
export const VOICES = ['female', 'male'];
export const VOICE_EFFECTS = ['lowpass', 'highpass', 'bandpass', 'delay', 'reverb', 'distort', 'bitcrush', 'chorus', 'phaser', 'vol', 'pan'];
