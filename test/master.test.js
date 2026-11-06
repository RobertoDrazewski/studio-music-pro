import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startApp, client, loginAdmin, createUser } from './helpers.js';

let app;
let workDir;
let toneWav;
let silentWav;

function makeWav(file, source) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', source, '-ar', '44100', '-c:a', 'pcm_s16le', file]);
}

before(async () => {
  app = await startApp();
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-audio-'));
  toneWav = path.join(workDir, 'tone.wav');
  silentWav = path.join(workDir, 'silent.wav');
  // A quiet stereo-ish test signal: two sines, low level, so mastering has real work to do.
  makeWav(toneWav, 'sine=frequency=110:duration=6,volume=0.05');
  makeWav(silentWav, 'anullsrc=r=44100:cl=mono,atrim=duration=3');
});

after(async () => {
  await app.stop();
  fs.rmSync(workDir, { recursive: true, force: true });
});

const wavBlob = (file) => new Blob([fs.readFileSync(file)], { type: 'audio/wav' });

async function submit(c, { files, fields = {} }) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append(f.field, f.blob, f.name);
  return c.post('/api/master', form);
}

async function waitForJob(c, id, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await c.get(`/api/master/jobs/${id}`);
    if (r.data.job.status === 'done' || r.data.job.status === 'failed') return r.data.job;
    await new Promise((r2) => setTimeout(r2, 250));
  }
  throw new Error('job timed out');
}

test('master: produces a ZIP with master, mix, stems, code and report; loudness lands near the target', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'dj@example.com' });

  const res = await submit(u.client, {
    fields: { title: 'My First Track!', preset: 'clean', targetLufs: '-14', code: 'bpm 120\nkick "x . . ."' },
    files: [
      { field: 'mix', blob: wavBlob(toneWav), name: 'mix.wav' },
      { field: 'stems', blob: wavBlob(toneWav), name: 'Kick Drum.wav' },
      { field: 'stems', blob: wavBlob(toneWav), name: 'Kick Drum.wav' },
    ],
  });
  assert.equal(res.status, 202, JSON.stringify(res.data));
  const job = await waitForJob(u.client, res.data.job.id);
  assert.equal(job.status, 'done', job.error);
  assert.equal(job.ready, true);
  assert.ok(Math.abs(job.metrics.outputLufs - -14) < 1.5, `LUFS was ${job.metrics.outputLufs}`);
  assert.ok(job.metrics.outputTruePeakDb <= -0.5, `true peak was ${job.metrics.outputTruePeakDb}`);

  const dl = await u.client.get(`/api/master/jobs/${job.id}/download`);
  assert.equal(dl.status, 200);
  const zipPath = path.join(workDir, 'out.zip');
  fs.writeFileSync(zipPath, Buffer.from(dl.data));
  const names = execFileSync('unzip', ['-Z1', zipPath]).toString().split('\n').filter(Boolean).sort();
  assert.deepEqual(names, [
    'README.txt',
    'master/my-first-track-master.mp3',
    'master/my-first-track-master.wav',
    'mix/my-first-track-mix.wav',
    'project/my-first-track.pulse',
    'stems/kick-drum-2.wav',
    'stems/kick-drum.wav',
  ]);
  const readme = execFileSync('unzip', ['-p', zipPath, 'README.txt']).toString();
  assert.match(readme, /Output loudness/);

  // temporary uploads are gone
  assert.deepEqual(fs.readdirSync(app.config.tmpDir), []);
});

test('master: another user cannot see or download the job', async () => {
  const admin = await loginAdmin(app.base);
  const a = await createUser(app.base, admin, { email: 'own@example.com' });
  const b = await createUser(app.base, admin, { email: 'intruder@example.com' });
  const res = await submit(a.client, { files: [{ field: 'mix', blob: wavBlob(toneWav), name: 'm.wav' }] });
  const job = await waitForJob(a.client, res.data.job.id);
  assert.equal(job.status, 'done');
  assert.equal((await b.client.get(`/api/master/jobs/${job.id}`)).status, 404);
  assert.equal((await b.client.get(`/api/master/jobs/${job.id}/download`)).status, 404);
  assert.equal((await client(app.base).get(`/api/master/jobs/${job.id}/download`)).status, 401);
});

test('master: mp3 export of the raw mix', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'mp3@example.com' });
  const res = await submit(u.client, { fields: { kind: 'mp3', title: 'Raw' }, files: [{ field: 'mix', blob: wavBlob(toneWav), name: 'm.wav' }] });
  const job = await waitForJob(u.client, res.data.job.id);
  assert.equal(job.status, 'done', job.error);
  const dl = await u.client.get(`/api/master/jobs/${job.id}/download`);
  assert.match(dl.headers.get('content-disposition'), /raw\.mp3/);
});

test('master: rejects non-WAV content, fake WAV headers, silence and missing files', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'bad@example.com' });

  const wrongType = await submit(u.client, { files: [{ field: 'mix', blob: new Blob(['hello'], { type: 'text/plain' }), name: 'a.txt' }] });
  assert.equal(wrongType.status, 400);

  const fake = await submit(u.client, { files: [{ field: 'mix', blob: new Blob(['this is not a wav file at all'], { type: 'audio/wav' }), name: 'a.wav' }] });
  assert.equal(fake.status, 400);

  const none = await submit(u.client, { fields: { title: 'x' }, files: [] });
  assert.equal(none.status, 400);

  const silent = await submit(u.client, { files: [{ field: 'mix', blob: wavBlob(silentWav), name: 's.wav' }] });
  const job = await waitForJob(u.client, silent.data.job.id);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /silent/i);

  assert.equal((await submit(u.client, { fields: { preset: 'nope' }, files: [{ field: 'mix', blob: wavBlob(toneWav), name: 'm.wav' }] })).status, 400);
  assert.deepEqual(fs.readdirSync(app.config.tmpDir), [], 'no leftovers in tmp');
});

test('master: daily quota is enforced per user', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'quota@example.com', masterDailyQuota: 1 });
  const first = await submit(u.client, { files: [{ field: 'mix', blob: wavBlob(toneWav), name: 'm.wav' }] });
  assert.equal(first.status, 202);
  const second = await submit(u.client, { files: [{ field: 'mix', blob: wavBlob(toneWav), name: 'm.wav' }] });
  assert.equal(second.status, 429);
  assert.equal(second.data.code, 'MASTER_QUOTA_EXCEEDED');
  await waitForJob(u.client, first.data.job.id);
});

test('master: file size limit', async () => {
  const small = await startApp({ config: { master: { maxUploadMb: 1 } } });
  try {
    const admin = await loginAdmin(small.base);
    const u = await createUser(small.base, admin, { email: 'size@example.com' });
    const big = new Blob([Buffer.alloc(2 * 1024 * 1024)], { type: 'audio/wav' });
    const r = await submit(u.client, { files: [{ field: 'mix', blob: big, name: 'big.wav' }] });
    assert.equal(r.status, 413);
    assert.deepEqual(fs.readdirSync(small.config.tmpDir), []);
  } finally {
    await small.stop();
  }
});

test('master: presets endpoint', async () => {
  const admin = await loginAdmin(app.base);
  const r = await admin.get('/api/master/presets');
  assert.deepEqual(r.data.presets.map((p) => p.id).sort(), ['clean', 'loud', 'punch', 'warm']);
});

test('master: upload session flow (one request per file) produces the same ZIP', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'sessions@example.com' });
  const wav = new Uint8Array(fs.readFileSync(toneWav));
  const wavHeader = { 'Content-Type': 'audio/wav' };

  const created = await u.client.post('/api/master/uploads');
  assert.equal(created.status, 201);
  const { uploadId } = created.data;

  // Wrong content type and fake WAV are rejected.
  assert.equal((await u.client.raw('PUT', `/api/master/uploads/${uploadId}/mix`, wav, { 'Content-Type': 'text/plain' })).status, 400);
  assert.equal((await u.client.raw('PUT', `/api/master/uploads/${uploadId}/mix`, new Uint8Array(100), wavHeader)).status, 400);

  // Starting without a mix fails but keeps the session.
  assert.equal((await u.client.post('/api/master', { title: 'x', uploadId })).status, 400);

  assert.equal((await u.client.raw('PUT', `/api/master/uploads/${uploadId}/mix`, wav, wavHeader)).status, 200);
  assert.equal((await u.client.raw('PUT', `/api/master/uploads/${uploadId}/stems/Kick%20Drum`, wav, wavHeader)).status, 200);

  // Another user cannot use the session.
  const other = await createUser(app.base, admin, { email: 'sessions2@example.com' });
  assert.equal((await other.client.post('/api/master', { title: 'x', uploadId })).status, 404);

  const started = await u.client.post('/api/master', { title: 'Session Track', preset: 'clean', uploadId });
  assert.equal(started.status, 202);
  const job = await waitForJob(u.client, started.data.job.id);
  assert.equal(job.status, 'done', job.error);

  // The session is consumed.
  assert.equal((await u.client.post('/api/master', { title: 'x', uploadId })).status, 404);
  const dl = await u.client.get(`/api/master/jobs/${job.id}/download`);
  assert.equal(dl.status, 200);
  assert.ok(Buffer.from(dl.data).includes(Buffer.from('kick-drum.wav')));
});
