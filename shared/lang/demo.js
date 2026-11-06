// Song typed automatically by the "Play demo" button.
export const DEMO_SONG = `// Pulse Studio demo: a deep house sketch
// Edit anything while it plays, changes enter on the next bar.
bpm 122
key a minor
swing 0.1

section groove 8
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."
  bass "a1 . a1 . c2 . e1 ." saw lowpass 380 sidechain kick

section build 8
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."
  openhat ". . . . . . . . . . . . . . x ."
  snare ". . . . x . . . . . . . x . . ."
  pad "[a2,c3,e3] _ _ _ [f2,a2,c3] _ _ _" saw lowpass 900 reverb 0.5 chorus 0.3 vol 0.5
  bass "a1 a1 c2 e1" saw lowpass 420 sidechain kick
  lead "e4 . g4 . a4 g4 e4 ." square lowpass 2400 delay 0.3 reverb 0.2 vol 0.6
  every 4 bars: lead pan -0.5

master reverb 0.1
`;
