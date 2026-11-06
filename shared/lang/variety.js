// Variety for generated songs: a different key, chord progression and instrument palette every time,
// so two songs of the same style do not sound like the same song. `rand` is injectable for tests.

import { KEY_ROOTS } from './promptbuilder.js';

export const PROGRESSIONS = {
  minor: [
    ['i VI III VII', 'epic, classic dance minor loop'],
    ['i VII VI VII', 'dark and driving'],
    ['i iv VII III', 'melancholic and wide'],
    ['i v VI iv', 'brooding and heavy'],
    ['i VI iv V', 'tense with a lift at the end'],
    ['i III VII VI', 'hopeful minor'],
    ['i i VII VI', 'hypnotic, stays near the root'],
  ],
  major: [
    ['I V vi IV', 'bright and anthemic'],
    ['I vi IV V', 'warm and nostalgic'],
    ['I IV vi V', 'open and uplifting'],
    ['vi IV I V', 'bittersweet'],
    ['I iii IV V', 'smooth and soulful'],
  ],
};

const DEFAULT_LEADS = ['lead', 'synth', 'keys', 'bell', 'pluck', 'arp'];
const DEFAULT_MIDS = ['pad', 'strings', 'organ', 'keys', 'stab'];

// Style id -> candidates. Anything not listed uses the defaults.
const PALETTES = {
  dub: { leads: ['organ', 'keys', 'stab', 'bell'], mids: ['organ', 'stab', 'pad', 'keys'] },
  'dub-techno': { leads: ['stab', 'bell', 'keys'], mids: ['pad', 'stab', 'strings'] },
  house: { leads: ['keys', 'stab', 'synth', 'pluck'], mids: ['stab', 'organ', 'pad', 'keys'] },
  'deep-house': { leads: ['keys', 'pluck', 'bell', 'synth'], mids: ['keys', 'pad', 'stab', 'strings'] },
  'tech-house': { leads: ['stab', 'pluck', 'synth'], mids: ['stab', 'organ', 'pad'] },
  techno: { leads: ['stab', 'arp', 'synth', 'bell'], mids: ['stab', 'pad', 'strings'] },
  trance: { leads: ['synth', 'arp', 'lead', 'bell'], mids: ['strings', 'pad', 'stab'] },
  psytrance: { leads: ['arp', 'synth', 'lead'], mids: ['pad', 'stab'] },
  'progressive-house': { leads: ['synth', 'keys', 'arp', 'bell'], mids: ['strings', 'pad', 'keys'] },
  'drum-and-bass': { leads: ['pluck', 'keys', 'synth', 'bell'], mids: ['strings', 'pad', 'keys', 'stab'] },
  jungle: { leads: ['organ', 'keys', 'stab', 'bell'], mids: ['pad', 'strings', 'organ'] },
  dubstep: { leads: ['synth', 'lead', 'bell'], mids: ['pad', 'strings', 'stab'] },
  'uk-garage': { leads: ['keys', 'stab', 'pluck', 'organ'], mids: ['stab', 'pad', 'keys'] },
  breakbeat: { leads: ['stab', 'keys', 'synth', 'pluck'], mids: ['organ', 'stab', 'pad'] },
  electro: { leads: ['synth', 'arp', 'pluck', 'lead'], mids: ['stab', 'pad'] },
  synthwave: { leads: ['synth', 'lead', 'arp', 'bell'], mids: ['strings', 'pad', 'stab'] },
  ambient: { leads: ['bell', 'keys', 'strings', 'pluck'], mids: ['strings', 'pad', 'keys'] },
  lofi: { leads: ['keys', 'bell', 'pluck', 'organ'], mids: ['keys', 'pad', 'organ', 'strings'] },
  downtempo: { leads: ['keys', 'bell', 'pluck', 'synth'], mids: ['strings', 'pad', 'keys'] },
  trap: { leads: ['bell', 'pluck', 'keys', 'synth'], mids: ['pad', 'strings'] },
  hardstyle: { leads: ['lead', 'synth', 'stab'], mids: ['pad', 'strings', 'stab'] },
};

const pickOne = (arr, rand) => arr[Math.floor(rand() * arr.length) % arr.length];
function pickTwo(arr, rand) {
  const a = pickOne(arr, rand);
  const b = pickOne(arr.filter((x) => x !== a), rand);
  return [a, b];
}

// Returns a short block of text for the generator prompt.
export function varietyText({ styleId = null, keyChosen = false, rand = Math.random } = {}) {
  const palette = PALETTES[styleId] ?? { leads: DEFAULT_LEADS, mids: DEFAULT_MIDS };
  const major = rand() < 0.2;
  const scale = major ? 'major' : 'minor';
  const [prog, feel] = pickOne(PROGRESSIONS[scale], rand);
  const [lead1, lead2] = pickTwo(palette.leads, rand);
  const [mid1, mid2] = pickTwo(palette.mids, rand);
  const lines = [
    'VARIATION FOR THIS SONG (so it does not sound like the reference song or like other songs of this style):',
    keyChosen ? '- Use the key the user asked for.' : `- Key: ${pickOne(KEY_ROOTS, rand)} ${scale} (write the key line and stay in that scale).`,
    `- Chord progression: ${prog} (${feel}); write the chords of pads and stabs from it, change chord every bar or every two bars.`,
    `- Main melodic voice: ${lead1}. Second colour: ${lead2} (use it in another section or as a counter line).`,
    `- Harmony: ${mid1}${mid2 ? ` and/or ${mid2}` : ''}.`,
    '- Write new patterns and a new melody. Do not copy the reference song note for note: keep its sound design ideas, change its notes and rhythms.',
  ];
  return lines.join('\n');
}
