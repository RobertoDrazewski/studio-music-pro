import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../shared/lang/parser.js';
import { LANGUAGE_GUIDE } from '../shared/lang/guide.js';

test('the example in the language guide is valid', () => {
  const example = LANGUAGE_GUIDE.split('EXAMPLE\n')[1];
  const r = parse(example);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.ast.bpm, 124);
  assert.deepEqual(r.ast.key, { root: 'a', scale: 'minor' });
  assert.deepEqual(r.ast.sections.map((s) => [s.name, s.bars]), [['intro', 8], ['drop', 16]]);
  assert.equal(r.ast.master[0].name, 'reverb');
});

test('instruments outside a section go to an implicit section', () => {
  const r = parse('bpm 128\nkick "x . . . x . . ."\nbass "c2 c2 eb2 g1" saw lowpass 400');
  assert.equal(r.ok, true);
  assert.equal(r.ast.sections.length, 1);
  assert.equal(r.ast.sections[0].tracks.length, 2);
  assert.equal(r.ast.sections[0].tracks[1].wave, 'saw');
});

test('chords accept commas or spaces inside brackets', () => {
  const a = parse('pad "[a2,c3,e3] ."');
  const b = parse('pad "[a2 c3 e3] ."');
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.deepEqual(a.ast.sections[0].tracks[0].steps[0].notes, ['a2', 'c3', 'e3']);
  assert.deepEqual(b.ast.sections[0].tracks[0].steps[0].notes, ['a2', 'c3', 'e3']);
});

test('step modifiers: repeat and probability', () => {
  const r = parse('hat "x*2 x? . x"');
  assert.equal(r.ok, true);
  const [s0, s1] = r.ast.sections[0].tracks[0].steps;
  assert.equal(s0.repeat, 2);
  assert.equal(s1.chance, 0.5);
});

test('comments are ignored but # inside notes is kept', () => {
  const r = parse('// intro\nbpm 100 // slow\nlead "f#4 . bb3 ." # trailing comment');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.ast.sections[0].tracks[0].steps.map((s) => s.notes?.[0] ?? s.kind), ['f#4', 'rest', 'bb3', 'rest']);
});

test('errors are reported per line and do not throw', () => {
  const r = parse(
    ['bpm 999', 'kick "c2 . ."', 'bass "x . ."', 'foo bar', 'lead "e4 g4" laser 1', 'hat "x*9"', 'kick "x . . ." lowpass 50000'].join('\n'),
  );
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.map((e) => e.line), [1, 2, 3, 4, 5, 6, 7]);
});

test('drums reject notes and melodic instruments reject x', () => {
  assert.equal(parse('kick "c2 ."').ok, false);
  assert.equal(parse('bass "x ."').ok, false);
});

test('sidechain must reference a known instrument and warns if absent in the section', () => {
  assert.equal(parse('bass "c2 ." sidechain banana').ok, false);
  const r = parse('bass "c2 ." sidechain kick');
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
});

test('every N bars automation', () => {
  const ok = parse('lead "e4 ."\nevery 4 bars: lead pan -0.5');
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.ast.sections[0].every[0].every, 4);
  assert.equal(parse('every 4 bars : lead pan 0.5').ok, true);
  assert.equal(parse('every 0 bars: lead pan 0.5').ok, false);
  assert.equal(parse('every 4 bars: lead').ok, false);
});

test('section validation', () => {
  assert.equal(parse('section drop 16').ok, true);
  assert.equal(parse('section drop 0').ok, false);
  assert.equal(parse('section drop 1.5').ok, false);
  assert.equal(parse('section 1bad 4').ok, false);
});

test('limits protect the engine', () => {
  assert.equal(parse('kick "' + Array(65).fill('x').join(' ') + '"').ok, false);
  assert.equal(parse(Array(401).fill('bpm 120').join('\n')).ok, false);
  assert.equal(parse('x'.repeat(301)).ok, false);
  assert.equal(parse(null).ok, false);
});

test('master only allows master-safe effects', () => {
  assert.equal(parse('master reverb 0.2').ok, true);
  assert.equal(parse('master bitcrush 8').ok, false);
});

test('voice lines: text, gender, bar, style and effects', async () => {
  const { parse } = await import('../shared/lang/parser.js');
  const r = parse('section a 8\n  kick "x . . ."\n  voice "Jah love" male bar 3 style "slow and deep" reverb 0.5 delay 0.7');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const v = r.ast.sections[0].voices[0];
  assert.deepEqual({ text: v.text, voice: v.voice, bar: v.bar, style: v.style }, { text: 'Jah love', voice: 'male', bar: 3, style: 'slow and deep' });
  assert.deepEqual(v.effects.map((e) => e.name), ['reverb', 'delay']);
  // defaults
  const d = parse('section a 4\n  voice "hello"').ast.sections[0].voices[0];
  assert.deepEqual({ voice: d.voice, bar: d.bar, style: d.style }, { voice: 'female', bar: 1, style: '' });
});

test('voice lines: errors and warnings', async () => {
  const { parse } = await import('../shared/lang/parser.js');
  assert.equal(parse('voice hello').ok, false);
  assert.equal(parse('voice ""').ok, false);
  assert.equal(parse('voice "x" robot').ok, false); // unknown word is treated as an effect name
  assert.equal(parse('voice "x" female bar 0').ok, false);
  assert.equal(parse('voice "x" female sidechain kick').ok, false);
  assert.equal(parse('voice "' + 'a'.repeat(201) + '"').ok, false);
  const late = parse('section a 2\n  voice "x" female bar 5');
  assert.equal(late.ok, true);
  assert.equal(late.warnings.length, 1);
  const many = Array.from({ length: 9 }, () => 'voice "x"').join('\n');
  assert.equal(parse('section a 4\n' + many).ok, false);
});

test('mic lines: recorded takes', () => {
  const r = parse('section a 4\n  kick "x . . ."\n  mic "lead vocal" bar 2 reverb 0.4');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const v = r.ast.sections[0].voices[0];
  assert.deepEqual({ text: v.text, voice: v.voice, bar: v.bar }, { text: 'lead vocal', voice: 'mic', bar: 2 });
  assert.equal(parse('mic lead').ok, false);
  assert.equal(parse('mic "x" bar 0').ok, false);
});
