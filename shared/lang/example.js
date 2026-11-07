// Canción de referencia que le muestro a la IA al crear una canción nueva: marca el nivel de arreglo y de sonido que espero
// (graves firmes, medios suaves sin agudos chillones, subidas y drops). No se copia: el género lo manda el pedido del usuario.
export const QUALITY_EXAMPLE = `// House profundo · 128 bpm · La menor · dura exactamente 2:00
// Idea: graves gordos que bombean con el bombo, acordes oscuros y una melodía grave (sin agudos de "piano de juguete").
bpm 128
key a minor
swing 0.08
master vol 0.9

// --- Intro: entra el ritmo suave y el pad oscuro, el filtro se va abriendo ---
section intro 8
  hat ". . x . . . x . . . x . . . x ." noise highpass 5000 lowpass 9000 vol 0.22
  perc ". x . . . x . . . x . . . x . x" tri lowpass 3000 reverb 0.2 vol 0.25
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 800 reverb 0.4 vol 0.4
  every 4 bars: pad lowpass 1800

// --- Groove: entra el bombo y el bajo que bombea ---
section groove 8
  kick "x . . . x . . . x . . . x . . ." sine vol 1
  clap ". . . . x . . . . . . . x . . ." noise lowpass 7000 reverb 0.25 vol 0.55
  hat "x? x? x? x? x? x? x? x? x? x? x? x? x? x? x? x?" noise highpass 6000 lowpass 9500 vol 0.18
  openhat ". . x . . . x . . . x . . . x ." noise lowpass 8000 vol 0.28
  bass ". . a1 . . . a1 . . . f1 . . . f1 ." saw lowpass 280 sidechain kick vol 0.9
  sub "a1 _ _ _ _ _ _ _ f1 _ _ _ _ _ _ _" sine lowpass 120 sidechain kick vol 0.8
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 1600 reverb 0.4 sidechain kick vol 0.35

// --- Subida: se va el bombo y el bajo, redoble de caja y el filtro sube ---
section build 4
  snare "x . x . x . x . x . x . x x x x" noise highpass 400 vol 0.5
  hat "x x x x x x x x x x x x x x x x" noise highpass 6000 lowpass 9500 vol 0.2
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 600 reverb 0.5 vol 0.4
  keys "e3 . . . g3 . . . a3 . . . b3 . . ." tri lowpass 1400 reverb 0.4 vol 0.3
  every 2 bars: snare highpass 1800
  every 2 bars: pad lowpass 2600

// --- Primer drop: todo junto, bajo pesado y melodía grave ---
section drop 16
  kick "x . . . x . . . x . . . x . . ." sine vol 1
  clap ". . . . x . . . . . . . x . . ." noise lowpass 7000 reverb 0.25 vol 0.55
  hat "x? x? x? x? x? x? x? x? x? x? x? x? x? x? x? x?" noise highpass 6000 lowpass 9500 vol 0.18
  openhat ". . x . . . x . . . x . . . x ." noise lowpass 8000 vol 0.3
  perc ". x . . . x . . . x . . . x . x" tri lowpass 3000 reverb 0.2 vol 0.22
  bass ". . a1 . . . a1 . . . f1 . . . f1 ." saw lowpass 320 distort 0.08 sidechain kick vol 0.95
  sub "a1 _ _ _ _ _ _ _ f1 _ _ _ _ _ _ _" sine lowpass 120 sidechain kick vol 0.85
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 1500 reverb 0.4 sidechain kick vol 0.32
  stab ". . [a2,c3,e3] . . . . . . . [f2,a2,c3] . . . . ." saw lowpass 1700 delay 0.2 reverb 0.2 sidechain kick vol 0.35
  synth "e3 . g3 . a3 . . . c3 . a3 . f3 . . ." saw lowpass 1500 delay 0.25 reverb 0.3 vol 0.42
  every 8 bars: synth delay 0.45
  every 4 bars: synth pan -0.25

// --- Quiebre: sin bombo ni bajo, queda la atmósfera ---
section break 8
  hat ". . x . . . x . . . x . . . x ." noise highpass 5000 lowpass 9000 vol 0.18
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 1300 reverb 0.55 vol 0.45
  strings "[c3,e3,g3] _ _ _ _ _ _ _ [a2,c3,f3] _ _ _ _ _ _ _" saw lowpass 1100 reverb 0.5 vol 0.3
  keys "e3 . . . g3 . . . a3 . . . g3 . . ." tri lowpass 1400 delay 0.3 reverb 0.5 vol 0.38
  sub "a1 _ _ _ _ _ _ _ f1 _ _ _ _ _ _ _" sine lowpass 100 vol 0.5

// --- Segunda subida: vuelve el bombo y el redoble más intenso ---
section build2 4
  kick "x . . . x . . . x . . . x . . ." sine vol 0.9
  snare "x . x . x . x . x x x x x x x x" noise highpass 600 vol 0.55
  hat "x x x x x x x x x x x x x x x x" noise highpass 6000 lowpass 9500 vol 0.2
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 700 reverb 0.5 vol 0.4
  every 2 bars: snare highpass 2200
  every 2 bars: pad lowpass 3000

// --- Segundo drop: igual de fuerte, con un arpegio grave que lo hace más rico ---
section drop2 12
  kick "x . . . x . . . x . . . x . . ." sine vol 1
  clap ". . . . x . . . . . . . x . . ." noise lowpass 7000 reverb 0.25 vol 0.55
  hat "x? x? x? x? x? x? x? x? x? x? x? x? x? x? x? x?" noise highpass 6000 lowpass 9500 vol 0.18
  openhat ". . x . . . x . . . x . . . x ." noise lowpass 8000 vol 0.32
  perc ". x . . . x . . . x . . . x . x" tri lowpass 3000 reverb 0.2 vol 0.22
  bass ". . a1 . . . a1 . . . f1 . . . f1 ." saw lowpass 340 distort 0.1 sidechain kick vol 0.95
  sub "a1 _ _ _ _ _ _ _ f1 _ _ _ _ _ _ _" sine lowpass 120 sidechain kick vol 0.85
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 1500 reverb 0.4 sidechain kick vol 0.3
  stab ". . [a2,c3,e3] . . . . . . . [f2,a2,c3] . . . . ." saw lowpass 1700 delay 0.2 reverb 0.2 sidechain kick vol 0.35
  synth "e3 . g3 . a3 . . . c3 . a3 . f3 . . ." saw lowpass 1500 delay 0.25 reverb 0.3 vol 0.42
  arp "a2 . c3 . e3 . c3 . f2 . a2 . c3 . a2 ." tri lowpass 1400 delay 0.3 reverb 0.25 sidechain kick vol 0.3
  every 4 bars: arp pan 0.3

// --- Final: se va quedando solo el ritmo ---
section outro 4
  kick "x . . . x . . . x . . . x . . ." sine vol 0.9
  hat ". . x . . . x . . . x . . . x ." noise highpass 5000 lowpass 9000 vol 0.2
  pad "[a2,c3,e3] _ _ _ _ _ _ _ [f2,a2,c3] _ _ _ _ _ _ _" saw lowpass 1200 reverb 0.5 vol 0.35
  every 2 bars: pad lowpass 500`;
