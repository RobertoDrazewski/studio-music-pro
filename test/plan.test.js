import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../shared/lang/parser.js';
import { DEMO_SONG } from '../shared/lang/demo.js';
import { locate, totalBars, planTrack, activeEvery, audibleSet, songInstruments, chanceValue, barSeconds } from '../shared/lang/plan.js';

const ast = (src) => {
  const r = parse(src);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.ast;
};

test('the demo song is valid and has no warnings', () => {
  const r = parse(DEMO_SONG);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
  assert.equal(totalBars(r.ast), 16);
});

test('locate walks sections in order and loops', () => {
  const a = ast('section a 2\n kick "x . . ."\nsection b 3\n hat "x . . ."');
  assert.equal(totalBars(a), 5);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((b) => locate(a, b).section.name), ['a', 'a', 'b', 'b', 'b', 'a', 'a']);
  assert.equal(locate(a, 3).barInSection, 1);
  a.loop = false;
  assert.equal(locate(a, 5), null);
  assert.equal(locate(ast('bpm 120'), 0), null);
});

test('planTrack: positions, holds and rests', () => {
  const a = ast('bass "a1 _ . c2"');
  const ev = planTrack(a.sections[0].tracks[0], 0, 0);
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map((e) => e.position), [0, 0.75]);
  assert.equal(ev[0].length, 0.5); // a1 + one hold = two of four steps
  assert.equal(ev[1].length, 0.25);
  assert.deepEqual(ev[0].notes, ['a1']);
});

test('planTrack: drums ignore holds and keep repeats', () => {
  const a = ast('hat "x*3 _ x ."');
  const ev = planTrack(a.sections[0].tracks[0], 0, 0);
  assert.equal(ev[0].repeat, 3);
  assert.equal(ev[0].length, 0.25);
});

test('swing marks odd steps only', () => {
  const ev = planTrack(ast('hat "x x x x"').sections[0].tracks[0], 0, 0);
  assert.deepEqual(ev.map((e) => e.swingable), [false, true, false, true]);
});

test('probability is deterministic and roughly 50%', () => {
  assert.equal(chanceValue(1, 2, 3), chanceValue(1, 2, 3));
  const track = ast('hat "x? x? x? x? x? x? x? x?"').sections[0].tracks[0];
  let hits = 0;
  for (let bar = 0; bar < 200; bar++) {
    const first = planTrack(track, 0, bar).map((e) => e.step);
    assert.deepEqual(first, planTrack(track, 0, bar).map((e) => e.step));
    hits += first.length;
  }
  const rate = hits / (200 * 8);
  assert.ok(rate > 0.4 && rate < 0.6, `rate was ${rate}`);
});

test('every N bars fires on the Nth bar of the section', () => {
  const a = ast('section s 8\n lead "e4 ."\n every 4 bars: lead pan -0.5');
  const s = a.sections[0];
  const fired = [0, 1, 2, 3, 4, 5, 6, 7].filter((b) => activeEvery(s, b).has('lead'));
  assert.deepEqual(fired, [3, 7]);
});

test('mute and solo, including live overrides', () => {
  const a = ast('mute hat\nkick "x ."\nhat "x ."');
  assert.equal(audibleSet(a)('hat'), false);
  assert.equal(audibleSet(a)('kick'), true);
  assert.equal(audibleSet(a, { solo: ['hat'] })('kick'), false);
  assert.equal(audibleSet(a, { solo: ['hat'] })('hat'), true);
});

test('songInstruments lists each instrument once, in order', () => {
  const a = ast('section a 1\n kick "x ."\n bass "c2 ."\nsection b 1\n kick "x ."\n lead "e4 ."');
  assert.deepEqual(songInstruments(a), ['kick', 'bass', 'lead']);
});

test('barSeconds', () => {
  assert.equal(barSeconds(120), 2);
  assert.ok(Math.abs(barSeconds(122) - 1.9672) < 0.001);
});
