import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReaperProject, buildReadme } from '../shared/lang/reaper.js';

test('reaper project has tempo, mix reference, folders and same-length items', () => {
  const rpp = buildReaperProject({
    bpm: 98, seconds: 61.5, mixFile: 'mix.wav',
    tracks: [
      { name: 'kick', file: 'stems/kick.wav', group: 'percussion' },
      { name: 'snare', file: 'stems/snare.wav', group: 'percussion' },
      { name: 'bass', file: 'stems/bass.wav', group: 'bass' },
    ],
  });
  assert.match(rpp, /^<REAPER_PROJECT/);
  assert.match(rpp, /TEMPO 98 4 4/);
  assert.match(rpp, /MUTESOLO 1 0 0/); // referencia de mezcla en mute
  assert.equal((rpp.match(/<TRACK/g) ?? []).length, 5); // mezcla + carpeta PERCUSSION + kick + snare + bass
  assert.equal((rpp.match(/POSITION 0\n/g) ?? []).length, 4);
  assert.equal((rpp.match(/LENGTH 61.5/g) ?? []).length, 4);
  assert.match(rpp, /ISBUS 1 1/);
  assert.match(rpp, /ISBUS 2 -1/);
  assert.match(rpp, /FILE "stems\/kick.wav"/);
  assert.equal((rpp.match(/</g) ?? []).length, (rpp.match(/^\s*>/gm) ?? []).length); // bloques balanceados
});

test('names cannot break the project file', () => {
  const rpp = buildReaperProject({ bpm: 120, seconds: 1, tracks: [{ name: 'a"b\nc', file: 'x.wav', group: null }] });
  assert.ok(!/a"b/.test(rpp));
});

test('readme mentions tempo and files', () => {
  const t = buildReadme({ title: 'Song', bpm: 100, seconds: 125, bits: 24, files: ['mix.wav'], hasProject: true });
  assert.match(t, /100 BPM/); assert.match(t, /2:05/); assert.match(t, /project\.rpp/);
});
