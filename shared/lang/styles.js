// Biblioteca de estilos de música electrónica. Se usa en tres lugares:
//  - el generador de IA (se agrega al prompt la descripción del estilo y una canción de referencia),
//  - el botón "Load template" (gratis, sin IA),
//  - la guarda de tempo (una canción generada nunca sale del rango de tempo de su estilo).
//
// Cada `example` es una canción Pulse completa y válida, y la revisa la suite de tests.
// Los patrones son de 16 pasos por compás: los pasos 1, 5, 9, 13 son los tiempos; 3, 7, 11, 15 son los contratiempos.

export const STYLES = [
  {
    id: 'house',
    name: 'House',
    aliases: ['house', 'classic house', 'chicago house'],
    bpm: [118, 128, 124],
    brief:
      'Four-on-the-floor kick on every beat, off-beat open hat (steps 3,7,11,15), clap or snare on beats 2 and 4, a rolling bass that answers the kick, piano-like stabs or a warm pad. Sidechain bass and pad to the kick. Simple, repetitive, groovy; a little swing (0.1). Arrangement: intro, groove, break, drop, outro.',
    example: `// House
bpm 124
key a minor
swing 0.1

section intro 8
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."

section groove 16
  kick "x . . . x . . . x . . . x . . ."
  clap ". . . . x . . . . . . . x . . ."
  hat "x . x . x . x . x . x . x . x ."
  openhat ". . x . . . x . . . x . . . x ."
  bass ". a1 . a1 . a1 c2 . . a1 . a1 . e1 g1 ." saw lowpass 500 sidechain kick
  pluck "[a3,c4,e4] . . [a3,c4,e4] . . [g3,b3,d4] . . . [f3,a3,c4] . . . . ." tri delay 0.3 reverb 0.3 vol 0.6

section break 8
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 1200 reverb 0.6 chorus 0.4 vol 0.6
  hat "x . x . x . x . x . x . x . x ."

section drop 16
  kick "x . . . x . . . x . . . x . . ."
  clap ". . . . x . . . . . . . x . . ."
  hat "x . x . x . x . x . x . x . x ."
  openhat ". . x . . . x . . . x . . . x ."
  bass ". a1 . a1 . a1 c2 . . a1 . a1 . e1 g1 ." saw lowpass 600 sidechain kick
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 1500 reverb 0.5 sidechain kick vol 0.5
  lead "e4 . g4 . a4 . g4 . e4 . d4 . c4 . . ." square lowpass 3000 delay 0.3 reverb 0.3 vol 0.5

master reverb 0.08
`,
  },
  {
    id: 'deep-house',
    name: 'Deep House',
    aliases: ['deep house', 'deep-house', 'deephouse'],
    bpm: [116, 124, 120],
    brief:
      'Warm and smooth. Soft four-on-the-floor kick, shuffled hats with swing 0.15, rim/clap on 2 and 4, a deep sine or filtered saw bass with long notes, jazzy minor-7 chords on a pad or pluck with reverb and chorus. Sidechain the pad. Avoid harsh sounds; keep filters around 400-1500 Hz.',
    example: `// Deep house
bpm 120
key d minor
swing 0.15

section intro 8
  kick "x . . . x . . . x . . . x . . ."
  pad "[d3,f3,a3,c4] _ _ _ _ _ _ _" saw lowpass 900 reverb 0.6 chorus 0.4 vol 0.5

section groove 16
  kick "x . . . x . . . x . . . x . . ."
  perc ". . . . x . . . . . . . x . . ." tri highpass 800 reverb 0.3
  hat ". . x . . . x . . . x . . . x ." highpass 6000 vol 0.6
  openhat ". . . . . . . . . . . . . . x ." vol 0.5
  sub "d1 _ _ . . . d1 _ f1 _ . . a1 _ . ." sine lowpass 200 sidechain kick
  pad "[d3,f3,a3,c4] _ _ _ [g2,bb2,d3,f3] _ _ _" saw lowpass 1000 reverb 0.6 chorus 0.4 sidechain kick vol 0.5
  pluck ". . a4 . . . f4 . . . d4 . . . c4 ." tri delay 0.4 reverb 0.4 vol 0.5

section break 8
  pad "[bb2,d3,f3,a3] _ _ _ [a2,c3,e3,g3] _ _ _" saw lowpass 800 reverb 0.7 chorus 0.5 vol 0.6
  pluck ". . a4 . . . g4 . . . f4 . . . e4 ." tri delay 0.5 reverb 0.5 vol 0.5

section groove2 16
  kick "x . . . x . . . x . . . x . . ."
  perc ". . . . x . . . . . . . x . . ." tri highpass 800 reverb 0.3
  hat ". . x . . . x . . . x . . . x ." highpass 6000 vol 0.6
  sub "d1 _ _ . . . d1 _ f1 _ . . a1 _ . ." sine lowpass 200 sidechain kick
  pad "[d3,f3,a3,c4] _ _ _ [g2,bb2,d3,f3] _ _ _" saw lowpass 1200 reverb 0.6 chorus 0.4 sidechain kick vol 0.5
  pluck "a4 . . f4 . . d4 . . c4 . . d4 . . ." tri delay 0.4 reverb 0.4 vol 0.5

master reverb 0.1
`,
  },
  {
    id: 'tech-house',
    name: 'Tech House',
    aliases: ['tech house', 'tech-house', 'techhouse'],
    bpm: [123, 130, 126],
    brief:
      'Tight and percussive. Punchy kick on every beat, short clap on 2 and 4, rolling 16th hats with gaps, shaker/perc patterns with syncopation, a one-note groovy bass that jumps an octave, very few melodic elements (a short stab or vocal-like pluck). Strong sidechain. Dry, minimal reverb.',
    example: `// Tech house
bpm 126
key g minor
swing 0.08

section intro 8
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."
  perc ". . . x . . x . . . . x . . x ." tri highpass 1000

section groove 16
  kick "x . . . x . . . x . . . x . . ."
  clap ". . . . x . . . . . . . x . . ."
  hat "x x . x x x . x x x . x x . x x" highpass 7000 vol 0.5
  openhat ". . x . . . x . . . x . . . x ."
  perc ". . . x . . x . . . . x . . x ." tri highpass 1000
  bass "g1 . g1 g2 . g1 . g1 . g1 g2 . . g1 bb1 ." saw lowpass 450 sidechain kick
  pluck ". . . . . . [g3,bb3,d4] . . . . . . . . ." square lowpass 2500 delay 0.4 vol 0.5

section drop 16
  kick "x . . . x . . . x . . . x . . ."
  clap ". . . . x . . . . . . . x . . ."
  hat "x x . x x x . x x x . x x . x x" highpass 7000 vol 0.5
  openhat ". . x . . . x . . . x . . . x ."
  perc ". . . x . . x . . . . x . . x ." tri highpass 1000
  bass "g1 . g1 g2 . g1 . g1 . g1 g2 . . g1 bb1 ." saw lowpass 700 sidechain kick
  pluck "[g3,bb3,d4] . . . . . [g3,bb3,d4] . . . [f3,a3,c4] . . . . ." square lowpass 3000 delay 0.4 reverb 0.15 vol 0.55
  every 4 bars: bass lowpass 1200

master reverb 0.05
`,
  },
  {
    id: 'techno',
    name: 'Techno',
    aliases: ['techno', 'detroit techno', 'berlin techno', 'peak time'],
    bpm: [126, 140, 132],
    brief:
      'Hard, hypnotic and repetitive. Heavy kick on every beat, offbeat open hat, 16th closed hats, minimal clap or rim, a dark rumbling bass (sub with short saw), a single evolving element (filter sweep, delay-washed stab). Use `every N bars:` to open/close filters so the track evolves. Minor key, low pitches, no sweet melodies. Distortion on the kick/bass is welcome.',
    example: `// Techno
bpm 132
key c minor

section intro 8
  kick "x . . . x . . . x . . . x . . ." distort 0.2
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.5

section build 16
  kick "x . . . x . . . x . . . x . . ." distort 0.3
  openhat ". . x . . . x . . . x . . . x ."
  hat "x x x x x x x x x x x x x x x x" highpass 7000 vol 0.35
  clap ". . . . x . . . . . . . x . . ." reverb 0.2
  bass ". c1 . . . c1 . . . c1 . . . c1 . ." saw lowpass 250 distort 0.2 sidechain kick
  every 4 bars: bass lowpass 900

section peak 16
  kick "x . . . x . . . x . . . x . . ." distort 0.4
  openhat ". . x . . . x . . . x . . . x ."
  hat "x x x x x x x x x x x x x x x x" highpass 7000 vol 0.35
  clap ". . . . x . . . . . . . x . . ." reverb 0.2
  perc ". . x . . x . . . x . . . . x ." tri highpass 1500 delay 0.4
  bass ". c1 . c1 . c1 eb1 . . c1 . c1 . c1 g1 ." saw lowpass 300 distort 0.3 sidechain kick
  lead "c3 . . . . . eb3 . . . . . g3 . . ." saw lowpass 1800 delay 0.5 reverb 0.4 vol 0.4
  every 8 bars: lead lowpass 4000

master distort 0.05
`,
  },
  {
    id: 'dub-techno',
    name: 'Dub Techno',
    aliases: ['dub techno', 'dub-techno', 'dubtechno', 'chain reaction'],
    bpm: [118, 128, 122],
    brief:
      'Deep, spacious and foggy. Soft kick on every beat, almost no hats, chord stabs on off-beats drenched in delay (0.6-0.8) and reverb (0.7), a sub bass that holds long notes, a gentle noise hat. Very slow evolution: `every 8 bars:` filter and delay moves. Minor 7th chords, nothing bright.',
    example: `// Dub techno
bpm 122
key f minor

section intro 8
  kick "x . . . x . . . x . . . x . . ." lowpass 600
  pad "[f3,ab3,c4,eb4] _ _ _ _ _ _ _" saw lowpass 700 reverb 0.8 chorus 0.5 vol 0.4

section main 16
  kick "x . . . x . . . x . . . x . . ." lowpass 600
  hat ". . . . . . . . . . . . . . x ." highpass 8000 vol 0.4
  sub "f1 _ _ _ _ _ _ _ f1 _ _ _ _ _ _ _" sine lowpass 150 sidechain kick
  pluck ". . [f3,ab3,c4,eb4] . . . . . . . [db3,f3,ab3,c4] . . . . ." tri lowpass 1400 delay 0.7 reverb 0.7 vol 0.55
  pad "[f3,ab3,c4,eb4] _ _ _ _ _ _ _" saw lowpass 600 reverb 0.9 chorus 0.5 vol 0.3
  every 8 bars: pluck lowpass 3000

section deep 16
  kick "x . . . x . . . x . . . x . . ." lowpass 600
  sub "f1 _ _ _ _ _ _ _ db1 _ _ _ _ _ _ _" sine lowpass 150 sidechain kick
  pluck ". . [db3,f3,ab3,c4] . . . . . . . [eb3,g3,bb3,db4] . . . . ." tri lowpass 1200 delay 0.8 reverb 0.8 vol 0.55

master reverb 0.15
`,
  },
  {
    id: 'trance',
    name: 'Trance',
    aliases: ['trance', 'uplifting trance', 'progressive trance'],
    bpm: [128, 140, 136],
    brief:
      'Euphoric and driving. Kick on every beat, off-beat open hat, rolling 16th bass (one repeated note with octave jumps), long supersaw-style chords (saw pad with chorus and reverb), a clear arpeggio or lead melody in minor with delay. Big breakdown with only pad and melody, then a drop with everything. Sections of 16 bars; tension builds with snare rolls (x*4).',
    example: `// Trance
bpm 138
key e minor

section intro 8
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."

section groove 16
  kick "x . . . x . . . x . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."
  clap ". . . . x . . . . . . . x . . ."
  bass ". e1 e1 e2 . e1 e1 e2 . e1 e1 e2 . e1 e1 e2" saw lowpass 600 sidechain kick
  arp "e4 g4 b4 g4 e4 g4 b4 g4 d4 f#4 a4 f#4 d4 f#4 a4 f#4" square lowpass 3500 delay 0.4 reverb 0.3 vol 0.5

section breakdown 16
  pad "[e3,g3,b3] _ _ _ [c3,e3,g3] _ _ _ [d3,f#3,a3] _ _ _ [b2,d3,f#3] _ _ _" saw lowpass 2500 chorus 0.6 reverb 0.7 vol 0.6
  lead "b4 _ _ _ g4 _ _ _ a4 _ _ _ f#4 _ _ _" saw lowpass 4000 delay 0.5 reverb 0.5 vol 0.5
  snare ". . . . . . . . . . . . x*2 x*2 x*4 x*4" reverb 0.2

section drop 16
  kick "x . . . x . . . x . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."
  clap ". . . . x . . . . . . . x . . ."
  bass ". e1 e1 e2 . e1 e1 e2 . e1 e1 e2 . e1 e1 e2" saw lowpass 700 sidechain kick
  pad "[e3,g3,b3] _ _ _ [c3,e3,g3] _ _ _ [d3,f#3,a3] _ _ _ [b2,d3,f#3] _ _ _" saw lowpass 3000 chorus 0.6 reverb 0.5 sidechain kick vol 0.5
  lead "b4 _ _ _ g4 _ _ _ a4 _ _ _ f#4 _ _ _" saw lowpass 5000 delay 0.5 reverb 0.4 vol 0.55
  arp "e4 g4 b4 g4 e4 g4 b4 g4 d4 f#4 a4 f#4 d4 f#4 a4 f#4" square lowpass 4000 delay 0.4 vol 0.4

master reverb 0.1
`,
  },
  {
    id: 'psytrance',
    name: 'Psytrance',
    aliases: ['psytrance', 'psy trance', 'goa', 'psy-trance', 'full on'],
    bpm: [138, 148, 145],
    brief:
      'Fast, hypnotic and alien. Punchy kick on every beat, a rolling 16th "galloping" bass between kicks (the signature: bass on steps 2,3,4 of every beat), off-beat open hat, squelchy arps and weird lead bleeps with heavy delay, sparse harmony. Minor or phrygian feel, repeated one-bar loops with filter automation (`every 2 bars:`).',
    example: `// Psytrance
bpm 145
key f minor

section intro 8
  kick "x . . . x . . . x . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."

section groove 16
  kick "x . . . x . . . x . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."
  hat "x . x . x . x . x . x . x . x ." highpass 8000 vol 0.4
  bass ". f1 f1 f1 . f1 f1 f1 . f1 f1 f1 . f1 f1 f1" saw lowpass 350 sidechain kick
  every 2 bars: bass lowpass 1400

section lead 16
  kick "x . . . x . . . x . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."
  bass ". f1 f1 f1 . f1 f1 f1 . f1 f1 f1 . f1 f1 f1" saw lowpass 500 sidechain kick
  arp "f4 ab4 c5 ab4 f4 gb4 c5 gb4 f4 ab4 db5 ab4 f4 gb4 c5 eb5" square lowpass 3000 delay 0.5 reverb 0.3 vol 0.45
  lead "c5 . . . ab4 . . . gb4 . . . f4 . . ." saw lowpass 4500 delay 0.6 reverb 0.4 vol 0.45
  every 2 bars: arp lowpass 5000

master reverb 0.08
`,
  },
  {
    id: 'progressive-house',
    name: 'Progressive House',
    aliases: ['progressive house', 'progressive', 'prog house'],
    bpm: [120, 128, 124],
    brief:
      'Melodic and building. Steady kick on every beat, soft off-beat open hat, long evolving pads, a plucky arp that develops over time, a bass that follows the chord roots. Long sections (16 bars) with gradual additions: add one element every 8 bars. Emotional minor progressions (i, VI, III, VII).',
    example: `// Progressive house
bpm 124
key a minor

section intro 8
  kick "x . . . x . . . x . . . x . . ."
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 1000 reverb 0.6 chorus 0.4 vol 0.5

section build 16
  kick "x . . . x . . . x . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."
  hat "x . x . x . x . x . x . x . x ." highpass 7000 vol 0.4
  bass "a1 . . a1 . . a1 . f1 . . f1 . . f1 ." saw lowpass 500 sidechain kick
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 1400 reverb 0.6 chorus 0.4 sidechain kick vol 0.5
  arp "a4 c5 e5 c5 a4 c5 e5 c5 f4 a4 c5 a4 f4 a4 c5 a4" tri lowpass 3000 delay 0.4 reverb 0.3 vol 0.4

section main 16
  kick "x . . . x . . . x . . . x . . ."
  clap ". . . . x . . . . . . . x . . ."
  openhat ". . x . . . x . . . x . . . x ."
  bass "a1 . . a1 . . a1 . g1 . . g1 . . g1 ." saw lowpass 600 sidechain kick
  pad "[a2,c3,e3] _ _ _ [g2,b2,d3] _ _ _" saw lowpass 2000 reverb 0.6 chorus 0.5 sidechain kick vol 0.5
  lead "e5 . d5 . c5 . . . d5 . c5 . b4 . . ." saw lowpass 4000 delay 0.4 reverb 0.4 vol 0.5
  arp "a4 c5 e5 c5 a4 c5 e5 c5 g4 b4 d5 b4 g4 b4 d5 b4" tri lowpass 3500 delay 0.4 vol 0.35

master reverb 0.1
`,
  },
  {
    id: 'drum-and-bass',
    name: 'Drum and Bass',
    aliases: ['drum and bass', 'drum & bass', 'drum n bass', 'dnb', 'd&b', "drum'n'bass", 'neurofunk', 'liquid'],
    bpm: [168, 178, 174],
    brief:
      'Fast breakbeat at ~174 bpm. The classic two-step: kick on step 1 and step 11, snare on beats 2 and 4 (steps 5 and 13), busy 16th hats with a ghost snare, a heavy rolling sub or a growling saw bass that moves between a few notes with long holds (half-time feel), airy pad or stabs on top. Liquid = soft pads and clean sub; neuro = distorted bass.',
    example: `// Drum and bass
bpm 174
key f minor

section intro 8
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . ."
  hat "x . x . x . x . x . x . x . x ." highpass 7000 vol 0.5
  pad "[f3,ab3,c4] _ _ _ _ _ _ _ [db3,f3,ab3] _ _ _ _ _ _ _" saw lowpass 1500 reverb 0.7 chorus 0.4 vol 0.5

section drop 16
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . x"
  hat "x . x x x . x . x x x . x . x x" highpass 7000 vol 0.45
  sub "f1 _ _ _ _ _ _ _ _ _ db1 _ _ _ _ _" sine lowpass 160 sidechain kick
  bass "f2 . . f2 . . ab2 . . . db2 . . . . ." saw lowpass 900 distort 0.3 sidechain kick vol 0.6
  pad "[f3,ab3,c4] _ _ _ _ _ _ _ [db3,f3,ab3] _ _ _ _ _ _ _" saw lowpass 2500 reverb 0.6 chorus 0.4 vol 0.4

section break 8
  pad "[f3,ab3,c4] _ _ _ _ _ _ _ [db3,f3,ab3] _ _ _ _ _ _ _" saw lowpass 2000 reverb 0.8 chorus 0.5 vol 0.6
  lead "c5 . . . ab4 . . . f4 . . . . . . ." tri lowpass 3500 delay 0.5 reverb 0.5 vol 0.5

section drop2 16
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . x"
  hat "x . x x x . x . x x x . x . x x" highpass 7000 vol 0.45
  sub "f1 _ _ _ _ _ _ _ _ _ db1 _ _ _ _ _" sine lowpass 160 sidechain kick
  bass "f2 . . f2 . . ab2 . . . db2 . . . . ." saw lowpass 1200 distort 0.4 sidechain kick vol 0.6
  every 4 bars: bass lowpass 2500

master reverb 0.06
`,
  },
  {
    id: 'jungle',
    name: 'Jungle',
    aliases: ['jungle', 'ragga jungle', 'oldschool jungle'],
    bpm: [160, 172, 166],
    brief:
      'Chopped, rolling breakbeats with lots of ghost snares and syncopated kicks, deep reggae-style sub bass with long notes, dub delays and echo on snares, dark pads or stabs. Like drum and bass but busier drums and a dub/ragga heart.',
    example: `// Jungle
bpm 166
key d minor

section intro 8
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . ." delay 0.3
  hat "x . x . x . x . x . x . x . x ." highpass 7000 vol 0.4

section main 16
  kick "x . . . . . x . . . x . . . . ."
  snare ". . . . x . . x . x . . x . . ." delay 0.4 reverb 0.2
  hat "x x . x x . x x x . x x . x x ." highpass 7000 vol 0.4
  perc ". . x . . . . . . . x . . . x ." tri highpass 1500 delay 0.4
  sub "d1 _ _ _ _ _ _ _ a1 _ _ _ f1 _ _ _" sine lowpass 150 sidechain kick
  pad "[d3,f3,a3] _ _ _ _ _ _ _ [c3,e3,g3] _ _ _ _ _ _ _" saw lowpass 1200 reverb 0.7 chorus 0.3 vol 0.4

master reverb 0.08
`,
  },
  {
    id: 'dubstep',
    name: 'Dubstep',
    aliases: ['dubstep', 'riddim', 'brostep'],
    bpm: [138, 144, 140],
    brief:
      'Half-time at 140 bpm: ONE snare on beat 3 (step 9), kick on step 1 and sometimes step 11, hats in steady 8ths. Wide, wobbling bass: a saw bass with distort and `every 1 bars:` filter moves; a deep sine sub underneath. Sparse dark pad. Build-up with snare rolls (x*2 then x*4) before the drop.',
    example: `// Dubstep
bpm 140
key f minor

section intro 8
  pad "[f2,ab2,c3] _ _ _ _ _ _ _" saw lowpass 800 reverb 0.8 vol 0.5
  hat "x . x . x . x . x . x . x . x ." highpass 7000 vol 0.4

section build 8
  kick "x . . . . . . . x . . . . . . ."
  snare ". . . . . . . . . . . . x*2 x*2 x*4 x*4" reverb 0.2
  pad "[f2,ab2,c3] _ _ _ _ _ _ _" saw lowpass 1500 reverb 0.7 vol 0.5

section drop 16
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . . . . . x . . . . . . ." reverb 0.3
  hat "x . x . x . x . x . x . x . x ." highpass 7000 vol 0.4
  sub "f1 _ _ _ _ _ _ _ f1 _ _ _ db1 _ _ _" sine lowpass 140 sidechain kick
  bass "f2 f2 . f2 . . ab2 . f2 f2 . f2 . . c3 ." saw lowpass 500 distort 0.6 sidechain kick vol 0.6
  every 1 bars: bass lowpass 2500

master distort 0.05
`,
  },
  {
    id: 'uk-garage',
    name: 'UK Garage',
    aliases: ['uk garage', 'garage', '2 step', '2-step', 'two step', 'speed garage'],
    bpm: [128, 136, 132],
    brief:
      'Skippy 2-step shuffle at ~132 bpm. Kick on step 1 and step 11 (not four-on-the-floor), snare/clap on beats 2 and 4, shuffled hats with swing 0.3, a bouncy sub bass, short chord stabs and a pitched vocal-like pluck. Warm, urban, slightly sentimental minor-7 chords.',
    example: `// UK garage
bpm 132
key e minor
swing 0.3

section intro 8
  kick "x . . . . . . . . . x . . . . ."
  hat "x . x . x . x . x . x . x . x ." highpass 7000 vol 0.5
  pad "[e3,g3,b3,d4] _ _ _ _ _ _ _" saw lowpass 1200 reverb 0.6 chorus 0.4 vol 0.4

section main 16
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . ." reverb 0.2
  hat "x . x x x . x . x . x x x . x ." highpass 7000 vol 0.45
  sub "e1 . . e1 . . . . . . g1 . . a1 . ." sine lowpass 160 sidechain kick
  pluck ". . [e3,g3,b3,d4] . . . . [e3,g3,b3,d4] . . . [c3,e3,g3,b3] . . . ." tri lowpass 2500 delay 0.3 reverb 0.4 vol 0.5
  lead "b4 . . g4 . . e4 . . . . . . . . ." tri lowpass 3500 delay 0.4 reverb 0.4 vol 0.4

master reverb 0.08
`,
  },
  {
    id: 'breakbeat',
    name: 'Breakbeat',
    aliases: ['breakbeat', 'breaks', 'big beat', 'nu skool breaks'],
    bpm: [120, 140, 130],
    brief:
      'Syncopated funky drum loop instead of four-on-the-floor: kick on steps 1, 4 or 7, 11; snare on 5 and 13 with a ghost on 16; swung hats; a fat saw bass riff with groove; stabs and a catchy lead. Energetic and playful.',
    example: `// Breakbeat
bpm 130
key g minor
swing 0.2

section intro 8
  kick "x . . x . . x . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . x"
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.5

section main 16
  kick "x . . x . . x . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . x"
  hat "x . x . x . x . x . x . x . x x" highpass 6000 vol 0.5
  bass "g1 . . g1 . . bb1 . . . g1 . . f1 . ." saw lowpass 700 distort 0.2 sidechain kick
  pluck ". . [g3,bb3,d4] . . . . . . . [f3,a3,c4] . . . . ." square lowpass 2500 delay 0.3 vol 0.5
  lead "d5 . bb4 . g4 . . . a4 . bb4 . d5 . . ." saw lowpass 3500 delay 0.3 vol 0.45

master reverb 0.06
`,
  },
  {
    id: 'electro',
    name: 'Electro',
    aliases: ['electro', 'electro funk', 'electroclash', 'miami bass'],
    bpm: [120, 135, 128],
    brief:
      'Robotic, funky and syncopated, with 808-style drums: booming kick with uneven pattern, snappy clap/snare on 2 and 4, short hats. Square or saw bass lines with staccato notes, vocoder-like lead lines and digital bleeps. Dry and punchy.',
    example: `// Electro
bpm 128
key c minor

section intro 8
  kick "x . . . . . x . . . x . . . . ."
  clap ". . . . x . . . . . . . x . . ."
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.5

section main 16
  kick "x . . . . . x . . . x . . . . ."
  clap ". . . . x . . . . . . . x . . ."
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.5
  bass "c1 . c1 . . c2 . . eb1 . eb1 . . g1 . ." square lowpass 600 sidechain kick
  lead "g4 . . g4 . bb4 . . c5 . . bb4 . g4 . ." saw lowpass 3000 delay 0.3 bitcrush 10 vol 0.45
  arp "c4 eb4 g4 eb4 c4 eb4 g4 eb4 c4 eb4 g4 eb4 bb3 d4 f4 d4" square lowpass 2500 delay 0.3 vol 0.3

master reverb 0.05
`,
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    aliases: ['synthwave', 'retrowave', 'outrun', '80s', 'synth wave'],
    bpm: [96, 118, 108],
    brief:
      'Retro 80s cinematic. Steady kick on beats 1 and 3 (or all four), big gated snare on 2 and 4 with reverb, 8th-note pulsing saw bass, lush chorus pads, bright analog lead melody with delay, arpeggios. Major or minor with emotional progressions.',
    example: `// Synthwave
bpm 108
key a minor

section intro 8
  kick "x . . . . . . . x . . . . . . ."
  snare ". . . . x . . . . . . . x . . ." reverb 0.5
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 1800 chorus 0.7 reverb 0.5 vol 0.5

section main 16
  kick "x . . . x . . . x . . . x . . ."
  snare ". . . . x . . . . . . . x . . ." reverb 0.5
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.4
  bass "a1 a1 a1 a1 a1 a1 a1 a1 f1 f1 f1 f1 g1 g1 g1 g1" saw lowpass 700 sidechain kick
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 2200 chorus 0.7 reverb 0.5 vol 0.45
  arp "a4 c5 e5 c5 a4 c5 e5 c5 f4 a4 c5 a4 g4 b4 d5 b4" square lowpass 3500 delay 0.4 chorus 0.3 vol 0.35
  lead "e5 . . d5 . c5 . . d5 . . c5 . b4 . ." saw lowpass 5000 delay 0.4 reverb 0.4 vol 0.5

master reverb 0.1
`,
  },
  {
    id: 'ambient',
    name: 'Ambient',
    aliases: ['ambient', 'ambiental', 'drone', 'atmospheric', 'soundscape', 'new age'],
    bpm: [60, 90, 72],
    brief:
      'No (or almost no) drums. Very long chords with slow attack feel, big reverb (0.8-1) and chorus, a deep sine drone, sparse bell-like plucks with long delays. Hold notes with "_". Slow evolution with `every 4 bars:` filter moves. Gentle, spacious, no percussion unless a very soft one.',
    example: `// Ambient
bpm 72
key d major

section a 16
  pad "[d3,f#3,a3,e4] _ _ _ _ _ _ _ [g2,b2,d3,a3] _ _ _ _ _ _ _" saw lowpass 900 reverb 0.9 chorus 0.6 vol 0.5
  sub "d1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _" sine lowpass 120 vol 0.5
  pluck ". . . . a4 . . . . . . . . . f#4 ." tri lowpass 3000 delay 0.7 reverb 0.8 vol 0.35
  every 4 bars: pad lowpass 2000

section b 16
  pad "[b2,d3,f#3,a3] _ _ _ _ _ _ _ [a2,c#3,e3,g3] _ _ _ _ _ _ _" saw lowpass 1100 reverb 0.9 chorus 0.6 vol 0.5
  sub "b1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _" sine lowpass 120 vol 0.5
  pluck ". . e5 . . . . . d5 . . . . . a4 ." tri lowpass 3000 delay 0.7 reverb 0.8 vol 0.35

master reverb 0.2
`,
  },
  {
    id: 'lofi',
    name: 'Lo-fi Hip Hop',
    aliases: ['lofi', 'lo-fi', 'lo fi', 'lofi hip hop', 'chillhop', 'chill hop', 'study beats'],
    bpm: [68, 88, 80],
    brief:
      'Relaxed dusty boom-bap at ~80 bpm with swing 0.25: kick on 1 and a late kick before 3, snare on 2 and 4, soft hats, a warm jazzy chord loop (maj7/min7) on a muted pluck or pad with bitcrush for vinyl grit, a mellow sine bass, a lazy melody. Low-pass everything (800-2500 Hz). Quiet, cozy.',
    example: `// Lo-fi hip hop
bpm 80
key d minor
swing 0.25

section loop 16
  kick "x . . . . . . x . . x . . . . ."
  snare ". . . . x . . . . . . . x . . ." lowpass 3000 reverb 0.2
  hat "x . x . x . x . x . x . x . x ." highpass 5000 lowpass 9000 vol 0.35
  sub "d1 _ _ . . . . . f1 _ _ . a1 _ _ ." sine lowpass 150 vol 0.6
  pad "[d3,f3,a3,c4] _ _ _ _ _ _ _ [g2,bb2,d3,f3] _ _ _ _ _ _ _" saw lowpass 1100 bitcrush 12 chorus 0.4 reverb 0.4 vol 0.4
  pluck ". . a4 . . f4 . . . . d4 . . e4 . ." tri lowpass 2500 bitcrush 12 delay 0.3 reverb 0.3 vol 0.45

master lowpass 9000
`,
  },
  {
    id: 'downtempo',
    name: 'Downtempo / Chillout',
    aliases: ['downtempo', 'chillout', 'chill out', 'chill', 'trip hop', 'trip-hop', 'lounge'],
    bpm: [80, 105, 92],
    brief:
      'Laid-back groove with a soft broken beat: kick on 1 and 11, snare on 5 and 13, shuffled hats, warm round bass, airy pads and a slow, singable melody with delay and reverb. Mellow, a little melancholic. Swing 0.2.',
    example: `// Downtempo
bpm 92
key e minor
swing 0.2

section main 16
  kick "x . . . . . . . . . x . . . . ."
  snare ". . . . x . . . . . . . x . . ."
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.4
  bass "e1 . . . . e1 . . g1 . . . a1 . . ." sine lowpass 300 vol 0.6
  pad "[e3,g3,b3,d4] _ _ _ _ _ _ _ [c3,e3,g3,b3] _ _ _ _ _ _ _" saw lowpass 1400 reverb 0.7 chorus 0.5 vol 0.45
  lead "b4 . . . g4 . . . a4 . . g4 . . e4 ." tri lowpass 3500 delay 0.5 reverb 0.5 vol 0.45

master reverb 0.1
`,
  },
  {
    id: 'dub',
    name: 'Reggae Dub',
    aliases: ['reggae dub', 'dub', 'roots dub', 'dub reggae', 'reggae', 'roots reggae', 'one drop', 'dub music'],
    bpm: [60, 80, 70],
    brief:
      'SLOW roots dub at 60-80 bpm. ONE DROP: the kick and the rim/snare hit together only on beat 3 (step 9), nothing on beat 1. Hats on every 8th. The skank: short chord stabs on the off-beats (steps 3,7,11,15) with plenty of delay. A deep, round, melodic sub bass with long notes (bubbling, walking between root and fifth, lots of space). Dub effects: heavy delay (0.6-0.9) and spring-like reverb on the skank and snare, and use `every 2 bars:` to throw delay/filter moves (the mixing desk "dub" gestures). Minor key, low-pass the pad. Sparse, hypnotic, lots of silence. Do NOT use four-on-the-floor or fast tempos.',
    example: `// Reggae dub, one drop
bpm 70
key a minor

section intro 8
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.4
  pluck ". . [a3,c4,e4] . . . [a3,c4,e4] . . . [a3,c4,e4] . . . [a3,c4,e4] ." square lowpass 1800 delay 0.6 reverb 0.5 vol 0.5

section one-drop 16
  kick ". . . . . . . . x . . . . . . ."
  perc ". . . . . . . . x . . . . . . ." tri highpass 400 delay 0.5 reverb 0.4
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.4
  sub "a1 _ _ _ . . a1 _ c2 _ . . e1 _ _ ." sine lowpass 160
  pluck ". . [a3,c4,e4] . . . [a3,c4,e4] . . . [g3,b3,d4] . . . [g3,b3,d4] ." square lowpass 1800 delay 0.7 reverb 0.5 vol 0.5
  every 2 bars: pluck delay 0.9

section dub 16
  kick ". . . . . . . . x . . . . . . ."
  perc ". . . . . . . . x . . . . . . ." tri highpass 400 delay 0.8 reverb 0.6
  hat "x . x . x . x . x . x . x . x ." highpass 6000 vol 0.3
  sub "a1 _ _ _ . . a1 _ c2 _ . . e1 _ _ ." sine lowpass 160
  pluck ". . [a3,c4,e4] . . . . . . . [g3,b3,d4] . . . . ." square lowpass 1400 delay 0.9 reverb 0.7 vol 0.5
  pad "[a2,c3,e3] _ _ _ _ _ _ _" saw lowpass 700 reverb 0.8 vol 0.3
  lead "e4 _ _ _ . . . . d4 _ _ _ . . . ." tri lowpass 2500 delay 0.8 reverb 0.7 vol 0.35
  every 2 bars: lead delay 1

master reverb 0.15
`,
  },
  {
    id: 'trap',
    name: 'Trap',
    aliases: ['trap', 'hip hop trap', 'trap beat', 'drill'],
    bpm: [130, 150, 140],
    brief:
      'Half-time feel at 140: snare/clap only on beat 3 (step 9), sparse booming 808 sub bass (sine with long notes and glides between roots), kicks on syncopated steps, ultra-fast hat rolls (x*3, x*4) on some steps, dark minor bells or pluck melody with reverb.',
    example: `// Trap
bpm 140
key f minor

section intro 4
  hat "x x x x x x x x x x x x x x x x" highpass 7000 vol 0.3
  pluck "c5 . . . ab4 . . . f4 . . . . . . ." tri lowpass 4000 reverb 0.6 delay 0.4 vol 0.5

section main 16
  kick "x . . . . . . x . . x . . . . ."
  clap ". . . . . . . . x . . . . . . ." reverb 0.3
  hat "x . x x x . x x x . x x x*3 . x*4 ." highpass 7000 vol 0.4
  sub "f1 _ _ _ _ _ _ f1 _ _ db1 _ _ _ _ _" sine lowpass 140 distort 0.1
  pluck "c5 . . . ab4 . . . f4 . . . gb4 . ab4 ." tri lowpass 4000 reverb 0.6 delay 0.4 vol 0.5
  pad "[f3,ab3,c4] _ _ _ _ _ _ _ [db3,f3,ab3] _ _ _ _ _ _ _" saw lowpass 900 reverb 0.7 vol 0.3

master reverb 0.05
`,
  },
  {
    id: 'hardstyle',
    name: 'Hardstyle / Hard Dance',
    aliases: ['hardstyle', 'hard dance', 'hardcore', 'gabber', 'rawstyle'],
    bpm: [150, 175, 150],
    brief:
      'Distorted, aggressive and anthemic. Pounding distorted kick on every beat with a rolling reverse bass between kicks (steps 3,7,11,15 in octaves), off-beat open hat, a screeching saw lead melody with distortion, big breakdown with piano-like pluck chords.',
    example: `// Hardstyle
bpm 150
key e minor

section intro 8
  kick "x . . . x . . . x . . . x . . ." distort 0.6
  openhat ". . x . . . x . . . x . . . x ."

section drop 16
  kick "x . . . x . . . x . . . x . . ." distort 0.7
  openhat ". . x . . . x . . . x . . . x ."
  clap ". . . . x . . . . . . . x . . ."
  bass ". . e1 . . . e2 . . . e1 . . . e2 ." saw lowpass 500 distort 0.5 sidechain kick
  lead "e5 . . e5 . b4 . . g5 . . e5 . d5 . ." saw lowpass 5000 distort 0.5 delay 0.3 vol 0.5

section break 8
  pluck "[e3,g3,b3] . . . [c3,e3,g3] . . . [d3,f#3,a3] . . . [b2,d3,f#3] . . ." tri lowpass 3000 reverb 0.6 vol 0.6
  pad "[e3,g3,b3] _ _ _ [c3,e3,g3] _ _ _" saw lowpass 2500 reverb 0.7 chorus 0.4 vol 0.4

master distort 0.05
`,
  },
];

export const STYLE_BY_ID = Object.fromEntries(STYLES.map((s) => [s.id, s]));

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9&' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Busco el estilo del que habla un pedido en texto libre. Ganan los alias más largos ("deep house" sobre "house",
// "dub techno" sobre "dub" y "techno", "reggae dub" sobre "dub").
export function detectStyle(text) {
  const t = ` ${normalize(text ?? '')} `;
  let best = null;
  let bestLen = 0;
  for (const style of STYLES) {
    for (const alias of style.aliases) {
      const a = normalize(alias);
      if (a.length > bestLen && t.includes(` ${a} `)) {
        best = style;
        bestLen = a.length;
      }
    }
  }
  return best;
}

export function styleList() {
  return STYLES.map((s) => ({ id: s.id, name: s.name, bpm: s.bpm }));
}

// Reemplazo la primera línea `bpm` (o agrego una arriba de todo).
export function setBpmInCode(code, bpm) {
  const line = `bpm ${Math.round(bpm)}`;
  if (/^\s*bpm\s+\S+/m.test(code)) return code.replace(/^(\s*)bpm\s+\S+.*$/m, `$1${line}`);
  return `${line}\n${code}`;
}

// Guarda de tempo: si el tempo de la canción está fuera del rango del estilo, lo llevo al valor por defecto del estilo.
export function enforceStyleTempo(code, style, currentBpm) {
  if (!style) return { code, changed: false };
  const [min, max, def] = style.bpm;
  if (currentBpm >= min && currentBpm <= max) return { code, changed: false };
  return { code: setBpmInCode(code, def), changed: true };
}

// Lo que se le cuenta al generador sobre un estilo.
export function styleBriefText(style) {
  const [min, max, def] = style.bpm;
  return `STYLE: ${style.name}
TEMPO: ${min}-${max} bpm (typical ${def}). Never go outside this range.
STYLE RULES: ${style.brief}

REFERENCE SONG in this style (study its drum placement, bass role, instrument choice, effect levels and arrangement; then write a NEW song with a different melody, chord progression and key; do not copy it):
${style.example}`;
}

export const GENERIC_BRIEF_TEXT =
  'No specific style was named. Pick the electronic style that best matches the description (mood, tempo words, instruments mentioned) and respect the typical tempo and drum patterns of that style.';
