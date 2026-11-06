import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../shared/lang/parser.js';
import { DEMO_SONG } from '../shared/lang/demo.js';
import { setGlobal, removeGlobal, setTrackEffect, setTrackWave, setStep, resizePattern, transposeTrack, transposeNote, scaleNotes, splitPattern } from '../shared/lang/edit.js';

const ok = (code) => {
  const r = parse(code);
  assert.equal(r.ok, true, JSON.stringify(r.errors) + '\n' + code);
  return r.ast;
};

test('setGlobal replaces or inserts bpm and swing', () => {
  assert.match(setGlobal(DEMO_SONG, 'bpm', 90), /^bpm 90$/m);
  ok(setGlobal(DEMO_SONG, 'bpm', 90));
  const bare = 'kick "x . . ."';
  assert.equal(setGlobal(bare, 'bpm', 100), 'bpm 100\nkick "x . . ."');
  // inserted after a leading comment block
  assert.equal(setGlobal('// hi\nkick "x ."', 'swing', 0.2), '// hi\nswing 0.2\nkick "x ."');
  assert.doesNotMatch(removeGlobal(DEMO_SONG, 'swing'), /swing/);
});

test('setTrackEffect changes, adds and removes effects on every section', () => {
  let c = setTrackEffect(DEMO_SONG, 'bass', 'lowpass', 1000);
  const ast = ok(c);
  const bassFx = ast.sections.flatMap((s) => s.tracks.filter((t) => t.instrument === 'bass')).map((t) => t.effects.find((e) => e.name === 'lowpass').args[0]);
  assert.deepEqual(bassFx, [1000, 1000]);
  c = setTrackEffect(c, 'lead', 'reverb', 0.8);
  assert.match(c, /lead .* reverb 0\.8/);
  c = setTrackEffect(c, 'lead', 'distort', 0.3);
  assert.match(c, /lead .* distort 0\.3/);
  ok(c);
  c = setTrackEffect(c, 'lead', 'distort', null);
  assert.doesNotMatch(c, /distort/);
  ok(c);
});

test('setTrackEffect can target one section', () => {
  const c = setTrackEffect(DEMO_SONG, 'bass', 'lowpass', 777, { section: 'build' });
  const ast = ok(c);
  const get = (name) => ast.sections.find((s) => s.name === name).tracks.find((t) => t.instrument === 'bass').effects.find((e) => e.name === 'lowpass').args[0];
  assert.equal(get('build'), 777);
  assert.equal(get('groove'), 380);
});

test('setTrackWave replaces or inserts the wave', () => {
  const c = setTrackWave(DEMO_SONG, 'bass', 'square');
  const ast = ok(c);
  assert.deepEqual(ast.sections.flatMap((s) => s.tracks).filter((t) => t.instrument === 'bass').map((t) => t.wave), ['square', 'square']);
  const k = setTrackWave('kick "x . . ."', 'kick', 'saw');
  assert.equal(k, 'kick "x . . ." saw');
  assert.equal(setTrackWave(DEMO_SONG, 'bass', 'banana'), DEMO_SONG);
});

test('setStep and resizePattern', () => {
  const code = 'bpm 100\nsection a 4\n  kick "x . . ."\n  bass "c2 . . ."';
  assert.match(setStep(code, 3, 1, 'x'), /kick "x x \. \."/);
  assert.match(setStep(code, 4, 0, '[c2,g2]'), /bass "\[c2,g2\] \. \. \."/);
  ok(setStep(code, 4, 0, '[c2,g2]'));
  assert.equal(setStep(code, 3, 9, 'x'), code);
  assert.match(resizePattern(code, 3, 8), /kick "x \. \. \. \. \. \. \."/);
  assert.match(resizePattern('  kick "x . x . x . x ."', 1, 4), /"x \. x \."/);
});

test('transpose moves notes and chords and keeps rests, holds and modifiers', () => {
  assert.equal(transposeNote('c2', 12), 'c3');
  assert.equal(transposeNote('eb3', 2), 'f3');
  assert.equal(transposeNote('b2', 1), 'c3');
  assert.equal(transposeNote('c0', -1), 'c0');
  const code = 'section a 4\n  pad "[a2,c3,e3] _ . c3*2 e3?" saw reverb 0.5';
  const out = transposeTrack(code, 'pad', 12);
  assert.match(out, /pad "\[a3,c4,e4\] _ \. c4\*2 e4\?" saw reverb 0\.5/);
  ok(out);
  assert.deepEqual(splitPattern('[a2,c3] . x'), ['[a2,c3]', '.', 'x']);
});

test('scaleNotes lists the notes of the key', () => {
  assert.deepEqual(scaleNotes('a', 'minor', 1, 1), ['a1', 'b1', 'c2', 'd2', 'e2', 'f2', 'g2']);
  assert.equal(scaleNotes('c', 'major', 2, 3).length, 14);
});

test('insertLineInSection / removeLine', async () => {
  const { insertLineInSection, removeLine } = await import('../shared/lang/edit.js');
  const code = 'bpm 90\nsection a 4\n  kick "x . . ."\n\nsection b 4\n  snare "x . x ."';
  const out = insertLineInSection(code, 'a', 'voice "hi" female');
  assert.equal(out.split('\n')[3], '  voice "hi" female');
  assert.ok(out.indexOf('voice') < out.indexOf('section b'));
  const end = insertLineInSection(code, 'b', 'voice "yo" male');
  assert.ok(end.trim().endsWith('voice "yo" male'));
  assert.equal(removeLine(out, 4), code);
});
