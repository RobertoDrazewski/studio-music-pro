import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../shared/lang/parser.js';
import { totalBars } from '../shared/lang/plan.js';
import { STYLES, detectStyle, enforceStyleTempo, setBpmInCode, styleBriefText } from '../shared/lang/styles.js';

for (const s of STYLES) {
  test(`style ${s.id}: reference song is valid, in tempo range and long enough`, () => {
    const r = parse(s.example);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.deepEqual(r.warnings, [], JSON.stringify(r.warnings));
    assert.ok(r.ast.bpm >= s.bpm[0] && r.ast.bpm <= s.bpm[1], `bpm ${r.ast.bpm} outside ${s.bpm}`);
    assert.ok(s.bpm[2] >= s.bpm[0] && s.bpm[2] <= s.bpm[1]);
    assert.ok(totalBars(r.ast) >= 16);
    assert.ok(styleBriefText(s).includes(s.name));
  });
}

test('detectStyle prefers the most specific alias', () => {
  assert.equal(detectStyle('quiero un reggae dub lento').id, 'dub');
  assert.equal(detectStyle('I need a electronic dub super deep bass').id, 'dub');
  assert.equal(detectStyle('dub techno oscuro').id, 'dub-techno');
  assert.equal(detectStyle('a deep house track').id, 'deep-house');
  assert.equal(detectStyle('drum and bass a 174').id, 'drum-and-bass');
  assert.equal(detectStyle('some DnB please').id, 'drum-and-bass');
  assert.equal(detectStyle('tech house groove').id, 'tech-house');
  assert.equal(detectStyle('techno duro').id, 'techno');
  assert.equal(detectStyle('house').id, 'house');
  assert.equal(detectStyle('something sad and slow'), null);
});

test('tempo guard moves out-of-range songs to the style default and keeps valid ones', () => {
  const dub = STYLES.find((s) => s.id === 'dub');
  const code = 'bpm 130\nsection a 4\n  kick "x . . ."';
  const fixed = enforceStyleTempo(code, dub, 130);
  assert.equal(fixed.changed, true);
  assert.match(fixed.code, /^bpm 70$/m);
  assert.equal(enforceStyleTempo(code, dub, 72).changed, false);
  assert.equal(setBpmInCode('kick "x"', 90), 'bpm 90\nkick "x"');
});

test('prompt builder: clicks and free text compose one precise prompt', async () => {
  const { emptySelection, composePrompt, selectionIsEmpty } = await import('../shared/lang/promptbuilder.js');
  const { buildGeneratorMessages } = await import('../shared/lang/guide.js');
  const sel = emptySelection();
  assert.equal(selectionIsEmpty(sel), true);
  sel.moods = ['dark', 'hypnotic'];
  sel.bpm = 138;
  sel.keyRoot = 'a';
  sel.energy = 'high';
  sel.structure = 'drop';
  sel.instruments = ['kick', 'bass', 'bogus'];
  sel.bass = 'rolling';
  sel.fx = ['sidechain'];
  sel.voice = { on: true, gender: 'male', text: 'Jah "love"', style: 'slow' };
  const p = composePrompt(sel, 'con mucho groove', { styleName: 'Techno' });
  assert.match(p, /^Style: Techno\./);
  assert.match(p, /Mood: dark, hypnotic\./);
  assert.match(p, /138 bpm/);
  assert.match(p, /key a minor/);
  assert.match(p, /Use these instruments: kick, bass\./);
  assert.match(p, /voice "Jah love" male style "slow"/);
  assert.match(p, /Extra details from the user: con mucho groove/);
  // free text alone is passed as-is; explicit bpm is picked up by the generator
  assert.equal(composePrompt(emptySelection(), 'hola mundo'), 'hola mundo');
  assert.equal(buildGeneratorMessages({ prompt: p, styleId: 'techno' }).explicitBpm, 138);
});

test('prompt builder: AI-written lyrics mode', async () => {
  const { emptySelection, composePrompt } = await import('../shared/lang/promptbuilder.js');
  const sel = emptySelection();
  sel.voice = { on: true, gender: 'female', text: 'night in the city', style: '', aiLyrics: true, lang: 'Spanish' };
  const p = composePrompt(sel, '');
  assert.match(p, /write short original lyrics in Spanish about "night in the city"/);
  assert.match(p, /not truly sung/);
});
