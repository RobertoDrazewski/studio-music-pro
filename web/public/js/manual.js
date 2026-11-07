// El manual completo: se aprende Pulse leyendo, copiando e insertando ejemplos que funcionan.
// El contenido sale de shared/lang/spec.js y recipes.js, así nunca se aleja de lo que acepta el parser.

import { h, modal, copyText, toast } from './dom.js';
import { DRUMS, MELODIC, EFFECTS, DEFAULT_WAVE, WAVES, GLOBALS, LIMITS } from '/shared/lang/spec.js';
import { RECIPES } from '/shared/lang/recipes.js';
import { INSTRUMENT_GROUPS, KEY_ROOTS } from '/shared/lang/promptbuilder.js';

const ROLE = {
  kick: ['The heartbeat. Hits where the beat is.', 'kick "x . . . x . . . x . . . x . . ."'],
  snare: ['Backbeat, usually on beats 2 and 4.', 'snare ". . . . x . . . . . . . x . . ."'],
  clap: ['Like a snare, airier. Great with house and techno.', 'clap ". . . . x . . . . . . . x . . ."'],
  hat: ['Closed hi-hat: the pulse between kicks.', 'hat ". . x . . . x . . . x . . . x ."'],
  openhat: ['Open hi-hat: a longer sizzle, usually off-beat.', 'openhat ". . x . . . . . . . x . . . . ."'],
  perc: ['Percussion: shakers, toms, little accents.', 'perc ". . . x . . x . . . . x . x . ."'],
  bass: ['The low melody. Notes in octaves 0-2.', 'bass "a1 . a1 . c2 . e1 ." saw lowpass 500'],
  sub: ['Pure low frequency under the bass. Long notes.', 'sub "a1 _ _ _ _ _ _ _" sine'],
  pad: ['Slow, soft chords that fill the background.', 'pad "[a2,c3,e3] _ _ _" saw lowpass 2500 reverb 0.4 vol 0.4'],
  strings: ['Very slow, wide, cinematic chords.', 'strings "[a2,c3,e3] _ _ _ _ _ _ _" vol 0.5'],
  organ: ['Short bubbly chords on the off-beats (reggae, house).', 'organ ". . [a3,c4,e4] . . . [a3,c4,e4] ." vol 0.4'],
  keys: ['Soft electric-piano chords or a gentle melody.', 'keys "[a3,c4,e4] . . . [f3,a3,c4] . . ." reverb 0.3'],
  stab: ['Short punchy chords. Classic in house and techno.', 'stab "[a3,c4,e4] . . . . . [a3,c4,e4] ." delay 0.3'],
  lead: ['The main melody. Bright and clear.', 'lead "a4 . c5 . e5 . c5 ." square delay 0.3 vol 0.5'],
  synth: ['A fatter, softer lead. Good for long melodies.', 'synth "a4 _ c5 _ e5 _ d5 _" saw reverb 0.3 vol 0.5'],
  bell: ['Sparkling high notes, sparse. Ambient and trap.', 'bell "e5 . . . a5 . . ." sine reverb 0.5'],
  pluck: ['Short plucked notes, a rhythmic melody.', 'pluck "a3 . c4 . e4 . c4 ." tri'],
  arp: ['Arpeggiator: spreads a chord over the step.', 'arp "[a3,c4,e4] [a3,c4,e4] [a3,c4,e4] [a3,c4,e4]" square'],
};

const FX = {
  lowpass: ['Lets only low frequencies through. Lower = darker and softer.', 'lowpass 800'],
  highpass: ['Removes the lows. Higher = thinner. Good for hats.', 'highpass 6000'],
  bandpass: ['Keeps only a band in the middle. Telephone-like.', 'bandpass 1200'],
  delay: ['Echo. 0 = none, 1 = lots. Great on skank hits and leads.', 'delay 0.35'],
  reverb: ['Space and room. 0 = dry, 1 = huge.', 'reverb 0.4'],
  distort: ['Adds grit and weight. Use small values on bass.', 'distort 0.3'],
  bitcrush: ['Lo-fi digital crunch. Lower number = crunchier (1 to 16).', 'bitcrush 8'],
  chorus: ['Thickens and widens the sound.', 'chorus 0.5'],
  phaser: ['A sweeping, whooshing movement.', 'phaser 0.5'],
  vol: ['Volume of this line (0 to 1.5).', 'vol 0.6'],
  pan: ['Left/right position: -1 left, 0 centre, 1 right.', 'pan -0.4'],
  sidechain: ['Ducks this line every time another instrument hits (the "pump").', 'sidechain kick'],
};

// Tríadas diatónicas de una tonalidad, escritas como acordes listos para usar.
const CHROMA = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const INTERVALS = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
const NUMERALS = { minor: ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'], major: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] };
function chordsOf(root, scale, octave = 3) {
  const r = CHROMA.indexOf(root);
  const iv = INTERVALS[scale];
  const at = (deg) => {
    const semis = r + iv[deg % 7] + 12 * Math.floor(deg / 7);
    return CHROMA[semis % 12] + (octave + Math.floor(semis / 12));
  };
  return iv.map((_, d) => ({ numeral: NUMERALS[scale][d], chord: `[${at(d)},${at(d + 2)},${at(d + 4)}]` }));
}

function codeBlock(lines, { insert, label = 'Insert into my song' }) {
  const text = lines.join('\n');
  return h('div', { class: 'mn-code' },
    h('pre', {}, text),
    h('div', { class: 'row', style: 'gap:6px' },
      insert ? h('button', { class: 'btn small primary', type: 'button', onclick: () => insert(lines) }, label) : null,
      h('button', { class: 'btn small', type: 'button', onclick: async () => { await copyText(text); toast('Copied', 'ok', 1500); } }, 'Copy')));
}

export function openManual({ insert }) {
  const tabs = {};
  const body = h('div', { class: 'mn' });
  let current = 'start';

  tabs.start = () => h('div', {},
    h('h3', {}, 'How a song is written'),
    h('p', {}, 'A song is plain text. Each line is one instrument playing one bar. The bar is split into 16 steps; every step is a hit, a note or a rest.'),
    codeBlock(['bpm 120', 'key a minor', '', 'section groove 8', '  kick "x . . . x . . . x . . . x . . ."', '  hat ". . x . . . x . . . x . . . x ."', '  bass "a1 . a1 . c2 . e1 ." saw lowpass 500'], { insert, label: 'Add this groove at the end' }),
    h('ol', { class: 'mn-list' },
      h('li', {}, h('b', {}, 'bpm'), ' sets the tempo (', `${GLOBALS.bpm.min}-${GLOBALS.bpm.max}`, '). ', h('b', {}, 'key'), ' tells you which notes sound good together.'),
      h('li', {}, h('b', {}, 'section name bars'), ' groups lines that play together for that many bars. Sections play one after another: intro, groove, drop...'),
      h('li', {}, 'Each instrument line is: ', h('b', {}, 'instrument "pattern" [wave] [effects]'), '.'),
      h('li', {}, 'Press Play, then edit while it plays: changes enter on the next bar.'),
      h('li', {}, `Limit: ${LIMITS.maxLines} lines per song.`)),
    h('p', { class: 'muted' }, 'Tip: you can also change almost everything with the Mixer, the tempo bar and the step editor. Every click rewrites the code so you can see what changed.'));

  tabs.rhythm = () => h('div', {},
    h('h3', {}, 'Drum patterns'),
    h('p', {}, 'A drum pattern has 16 steps (16th notes) per bar. ', h('b', {}, 'x'), ' = hit, ', h('b', {}, '.'), ' = rest. Steps 1, 5, 9 and 13 are the beats.'),
    codeBlock(['kick "x . . . x . . . x . . . x . . ."'], { insert, label: 'Insert' }),
    h('div', { class: 'mn-grid' },
      ...[['x*2', 'plays the hit twice in that step (rolls)'], ['x*3', 'three times (trap hats)'], ['x?', 'plays only half of the time (variation)'], ['x?0.25', 'plays 25% of the time'], ['_', 'holds the previous note (melodic lines)']]
        .map(([k, v]) => h('div', { class: 'mn-card' }, h('code', {}, k), h('span', {}, v)))),
    h('h3', {}, 'Ready-made rhythms'),
    ...RECIPES.filter((r) => ['four-floor', 'one-drop', 'dnb-break', 'trap-hats', 'buildup'].includes(r.id)).map((r) => recipeCard(r, insert)));

  tabs.notes = () => {
    const root = h('select', { class: 'select small-select' }, KEY_ROOTS.map((k) => h('option', { value: k, selected: k === 'a' }, k.toUpperCase())));
    const scale = h('select', { class: 'select small-select' }, ['minor', 'major'].map((k) => h('option', { value: k }, k)));
    const out = h('div', { class: 'mn-grid' });
    const draw = () => {
      out.replaceChildren(...chordsOf(root.value, scale.value).map((c) => h('button', { class: 'mn-card btn', type: 'button', title: 'Click to copy', onclick: async () => { await copyText(c.chord); toast(`Copied ${c.chord}`, 'ok', 1500); } }, h('b', {}, c.numeral), h('code', {}, c.chord))));
    };
    root.addEventListener('change', draw);
    scale.addEventListener('change', draw);
    draw();
    return h('div', {},
      h('h3', {}, 'Notes'),
      h('p', {}, 'A note is a letter, an optional ', h('b', {}, '#'), ' (sharp) or ', h('b', {}, 'b'), ' (flat) and an octave number: ', h('code', {}, 'c2  f#3  eb4'), '. Higher number = higher sound. Bass lives in octaves 0-2, chords in 2-4, melodies in 4-5.'),
      h('p', {}, h('b', {}, '.'), ' is a rest and ', h('b', {}, '_'), ' holds the previous note: ', h('code', {}, 'bass "a1 _ _ _ c2 _ e1 _"')),
      h('h3', {}, 'Chords'),
      h('p', {}, 'Put several notes inside brackets to play them together: ', h('code', {}, '[a2,c3,e3]'), '. Pick a key and click a chord to copy it.'),
      h('div', { class: 'row', style: 'gap:8px;margin-bottom:8px' }, root, scale), out,
      h('p', { class: 'muted' }, 'Popular progressions in a minor key: i VI III VII, i VII VI VII, i iv VII III. In major: I V vi IV, I vi IV V. Change chord every bar or every two bars.'));
  };

  tabs.instruments = () => h('div', {},
    h('h3', {}, 'Instruments'),
    h('p', {}, 'Every instrument can have a wave (', WAVES.join(', '), ') and effects after the pattern. Drums use x and . ; melodic instruments use notes.'),
    ...INSTRUMENT_GROUPS.map((g) => h('div', {}, h('h4', {}, g.label),
      h('div', { class: 'mn-inst' }, g.items.map((n) => h('div', { class: 'mn-card inst' },
        h('div', { class: 'row', style: 'gap:8px' }, h('img', { src: `/img/instruments/${n}.png`, alt: '', width: 32, height: 32 }), h('b', {}, n), h('span', { class: 'muted' }, `wave: ${DEFAULT_WAVE[n]}`)),
        h('p', {}, ROLE[n]?.[0] ?? ''),
        codeBlock([ROLE[n]?.[1] ?? `${n} ""`], { insert })))))),
    h('p', { class: 'muted' }, `${DRUMS.length} drum sounds and ${MELODIC.length} melodic sounds. Spoken voices and your own microphone takes are in the "Voices & mic" tab.`));

  tabs.effects = () => h('div', {},
    h('h3', {}, 'Effects'),
    h('p', {}, 'Effects go after the pattern and can be combined: ', h('code', {}, 'pad "[a2,c3,e3]" saw lowpass 1500 reverb 0.5 vol 0.4')),
    h('div', { class: 'mn-fx' }, Object.keys(EFFECTS).map((name) => {
      const a = EFFECTS[name].args[0];
      const range = a.instrument ? 'an instrument name' : `${a.min} to ${a.max}${a.optional ? ' (optional)' : ''}`;
      return h('div', { class: 'mn-card' }, h('b', {}, name), h('span', { class: 'muted' }, range), h('p', {}, FX[name]?.[0] ?? ''), h('code', {}, FX[name]?.[1] ?? name));
    })),
    h('h3', {}, 'Master bus'),
    h('p', {}, 'Effects for the whole song go on their own line: ', h('code', {}, 'master reverb 0.15'), '. Allowed: lowpass, highpass, reverb, delay, distort, vol.'));

  tabs.structure = () => h('div', {},
    h('h3', {}, 'Structure and automation'),
    codeBlock(['section intro 8', '  hat "x . x . x . x . x . x . x . x ."', '', 'section drop 16', '  kick "x . . . x . . . x . . . x . . ."', '  every 4 bars: hat pan -0.4'], { insert, label: 'Add at the end' }),
    h('ol', { class: 'mn-list' },
      h('li', {}, h('b', {}, 'section name bars'), ': the song plays its sections in order. Typical shape: intro, build, drop, breakdown, drop, outro.'),
      h('li', {}, h('b', {}, 'every N bars: instrument effect value'), ': on every Nth bar of the section that instrument changes. Use it for filter sweeps, delay throws and panning.'),
      h('li', {}, h('b', {}, 'loop on'), ' / ', h('b', {}, 'loop off'), ': repeat the song or stop at the end.'),
      h('li', {}, h('b', {}, 'swing 0.2'), ': shuffles the off-beat steps (0 to ', GLOBALS.swing.max, ').'),
      h('li', {}, h('b', {}, 'mute pad'), ' and ', h('b', {}, 'solo bass'), ': silence or isolate an instrument without deleting its line.')),
    h('p', { class: 'muted' }, 'To make every section different: remove or add an instrument, change a pattern, or open a filter.'));

  tabs.voices = () => h('div', {},
    h('h3', {}, 'AI voice'),
    h('p', {}, 'A spoken line made by a text-to-speech service. It speaks, it does not sing. It is generated only when you press Generate in the Voices panel and saved, so the same phrase is never paid twice.'),
    codeBlock(['voice "One love, one heart" male bar 1 style "slow, deep and warm" reverb 0.4'], { insert }),
    h('p', {}, h('b', {}, 'bar N'), ' = the bar of the section where it starts. ', h('b', {}, 'style'), ' describes how to say it.'),
    h('h3', {}, 'Your own voice (microphone)'),
    h('p', {}, 'Use "Record your voice" in the Voices panel. Choose your input (computer mic or USB interface), record over the song, and the take is added as a line:'),
    codeBlock(['mic "vocal 1" bar 1 reverb 0.3'], { insert }),
    h('p', { class: 'muted' }, 'Takes stay in this browser. This is how you get real singing.'));

  tabs.recipes = () => h('div', {}, h('h3', {}, 'Recipes'), h('p', {}, 'Complete ideas you can drop into your song and then tweak.'), ...RECIPES.map((r) => recipeCard(r, insert)));

  const NAMES = [['start', 'Start'], ['rhythm', 'Rhythm'], ['notes', 'Notes & chords'], ['instruments', 'Instruments'], ['effects', 'Effects'], ['structure', 'Structure'], ['voices', 'Voices & mic'], ['recipes', 'Recipes']];
  const nav = h('div', { class: 'mn-tabs', role: 'tablist' });
  const show = (id) => {
    current = id;
    for (const b of nav.children) b.setAttribute('aria-selected', String(b.dataset.id === id));
    body.replaceChildren(tabs[id]());
    body.scrollTop = 0;
  };
  for (const [id, label] of NAMES) nav.append(h('button', { type: 'button', role: 'tab', 'data-id': id, onclick: () => show(id) }, label));
  show(current);
  return modal({ title: 'Pulse manual', wide: true, body: h('div', { class: 'mn-wrap' }, nav, body) });
}

function recipeCard(r, insert) {
  return h('div', { class: 'mn-card recipe' }, h('div', { class: 'row', style: 'gap:8px' }, h('b', {}, r.title), h('span', { class: 'chip' }, r.tag)), h('p', {}, r.desc), codeBlock(r.lines, { insert }));
}
