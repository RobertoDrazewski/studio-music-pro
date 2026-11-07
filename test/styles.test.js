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
  // el texto libre solo se pasa tal cual; el bpm explícito lo recoge el generador
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

test('prompt builder: presets are valid and edit mode phrases clicks as changes', async () => {
  const pb = await import('../shared/lang/promptbuilder.js');
  const { STYLE_BY_ID } = await import('../shared/lang/styles.js');
  const { INSTRUMENTS } = await import('../shared/lang/spec.js');
  for (const p of pb.PRESETS) {
    assert.ok(STYLE_BY_ID[p.style], `${p.id}: style`);
    for (const i of p.instruments) assert.ok(INSTRUMENTS.includes(i), `${p.id}: ${i}`);
    for (const f of p.fx ?? []) assert.ok(pb.FX_CHOICES.some((x) => x.id === f), `${p.id}: fx ${f}`);
    for (const m of p.moods ?? []) assert.ok(pb.MOODS.includes(m), `${p.id}: mood ${m}`);
    if (p.bass) assert.ok(pb.BASS_TYPES.some((x) => x.id === p.bass), `${p.id}: bass`);
    if (p.structure) assert.ok(pb.STRUCTURES.some((x) => x.id === p.structure), `${p.id}: structure`);
  }
  const sel = pb.emptySelection();
  sel.edits = ['heavier-bass', 'add-build'];
  sel.instruments = ['pad'];
  const p = pb.composePrompt(sel, '', { styleName: 'Techno', mode: 'edit' });
  assert.match(p, /^Apply the following changes to the current song/);
  assert.match(p, /Make sure these instruments are present and audible: pad\./);
  assert.match(p, /Changes to make: make the bass heavier.*build-up/);
  assert.equal(pb.groupOf('kick'), 'percussion');
  assert.equal(pb.groupOf('pluck'), 'mids');
  assert.equal(pb.groupOf('voice'), 'voice');
});

test('variety: different picks each time, respects a chosen key and the style palette', async () => {
  const { varietyText, PROGRESSIONS } = await import('../shared/lang/variety.js');
  const { buildGeneratorMessages } = await import('../shared/lang/guide.js');
  const { INSTRUMENTS } = await import('../shared/lang/spec.js');
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(varietyText({ styleId: 'dub' }));
  assert.ok(seen.size > 10, 'many different combinations');
  for (const t of seen) {
    const lead = /Main melodic voice: (\w+)\./.exec(t)[1];
    assert.ok(INSTRUMENTS.includes(lead), lead);
  }
  assert.match(varietyText({ keyChosen: true }), /Use the key the user asked for/);
  assert.ok(Object.values(PROGRESSIONS).every((l) => l.length >= 5));
  const fixed = () => 0;
  const m = buildGeneratorMessages({ prompt: 'a techno track', styleId: 'techno', rand: fixed });
  assert.match(m.messages[1].content, /VARIATION FOR THIS SONG/);
  // el modo edición nunca agrega variación
  assert.doesNotMatch(buildGeneratorMessages({ prompt: 'faster', code: 'bpm 120', rand: fixed }).messages[1].content, /VARIATION/);
});
