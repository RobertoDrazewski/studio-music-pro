// Export flow: render the song in the browser, upload the audio, wait for the server job, download the result.
import { api } from './api.js';
import { renderProject, renderSong, encodeWav, songDuration } from './engine.js';
import { download } from './dom.js';
import { MAX_AUDIO_SECONDS } from './config.js';
import { makeZip } from './zip.js';
import { groupOf } from '/shared/lang/promptbuilder.js';
import { buildReaperProject, buildReadme } from '/shared/lang/reaper.js';

const UPLOAD_BUDGET_BYTES = 90 * 1024 * 1024; // each file must stay under the server limit (95 MB)

export const safeName = (title) =>
  (title || 'song')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'song';

// 24-bit when it fits in one upload, 16-bit for very long songs.
function pickBits(buffer) {
  const bytes24 = buffer.length * buffer.numberOfChannels * 3;
  return bytes24 <= UPLOAD_BUDGET_BYTES ? 24 : 16;
}

export function checkLength(ast) {
  const seconds = songDuration(ast);
  if (seconds > MAX_AUDIO_SECONDS) {
    throw new Error(`The song lasts ${Math.round(seconds / 60)} minutes. The limit is ${MAX_AUDIO_SECONDS / 60} minutes.`);
  }
}

// Plain WAV straight from the browser, no server involved.
export async function exportWav(ast, title, onStatus = () => {}) {
  checkLength(ast);
  onStatus('Rendering the mix…');
  const buffer = await renderSong(ast);
  download(encodeWav(buffer, 24), `${safeName(title)}.wav`);
}

async function poll(jobId, onStatus, signal) {
  for (let i = 0; i < 600; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const { job } = await api.job(jobId);
    if (job.status === 'done') return job;
    if (job.status === 'failed') throw new Error(job.error || 'The export failed');
    onStatus(job.status === 'queued' ? 'Waiting in the queue…' : 'Mastering…');
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('The export took too long');
}

// kind: 'master' (ZIP with mastered files, mix and stems) or 'mp3' (plain MP3 of the mix).
export async function exportViaServer({ ast, code, title, kind = 'master', preset = 'clean', targetLufs, onStatus = () => {}, onProgress = () => {}, signal }) {
  checkLength(ast);
  onStatus('Rendering in your browser…');
  const rendered = await renderProject(ast, {
    stems: kind === 'master',
    onProgress: (p) => {
      onProgress(p.step / p.total);
      onStatus(p.label === 'mix' ? 'Rendering the full mix…' : p.label === 'done' ? 'Render finished' : `Rendering stem: ${p.label}`);
    },
  });

  onStatus('Uploading…');
  const { uploadId } = await api.startUpload();
  await api.uploadMix(uploadId, encodeWav(rendered.mix, pickBits(rendered.mix)));
  for (const [i, stem] of rendered.stems.entries()) {
    if (signal?.aborted) throw new Error('Cancelled');
    onStatus(`Uploading stem ${i + 1} of ${rendered.stems.length}…`);
    await api.uploadStem(uploadId, stem.name, encodeWav(stem.buffer, pickBits(stem.buffer)));
  }

  onStatus('Starting…');
  const { job } = await api.startJob({ uploadId, kind, title, preset, targetLufs, code });
  const done = await poll(job.id, onStatus, signal);
  return { job: done, url: `/api/master/jobs/${done.id}/download`, filename: `${safeName(title)}-${kind === 'mp3' ? 'mix.mp3' : 'master.zip'}` };
}

// One stem (an instrument or a whole group) as a WAV, rendered in the browser. No server, no quota.
export async function exportStem(ast, title, names, label, onStatus = () => {}) {
  checkLength(ast);
  onStatus(`Rendering ${label}…`);
  const buffer = await renderSong(ast, { only: names });
  download(encodeWav(buffer, 24), `${safeName(title)}-${safeName(label)}.wav`);
}

// Studio pack: ZIP with the mix, the stems, a Reaper project and a short README. Everything stays in the browser.
// mode: 'instrument' | 'group' | 'both'.
export async function exportStudioPack({ ast, code, title, mode = 'instrument', bits = 24, rpp = true, onProgress = () => {}, onStatus = () => {} }) {
  checkLength(ast);
  const rendered = await renderProject(ast, {
    groups: mode, groupOf,
    onProgress: (p) => {
      onProgress(p.step / p.total);
      onStatus(p.label === 'mix' ? 'Rendering the full mix…' : p.label === 'done' ? 'Packing files…' : `Rendering ${p.label}`);
    },
  });
  const seconds = songDuration(ast);
  const base = safeName(title);
  const files = [{ name: 'mix.wav', data: encodeWav(rendered.mix, bits) }];
  const used = new Set();
  const nameFor = (s) => { let n = safeName(s.name); while (used.has(`${s.kind}/${n}`)) n += '-2'; used.add(`${s.kind}/${n}`); return n; };
  const tracks = [];
  const order = ['percussion', 'bass', 'mids', 'lead', 'voice', 'other'];
  const byGroup = (a, b) => order.indexOf(a.group) - order.indexOf(b.group);
  for (const s of [...rendered.stems].sort(byGroup)) {
    const path = `${s.kind === 'group' ? 'groups' : 'stems'}/${nameFor(s)}.wav`;
    files.push({ name: path, data: encodeWav(s.buffer, bits) });
    if (s.kind === 'instrument' || mode === 'group') tracks.push({ name: s.name, file: path, group: s.kind === 'instrument' ? s.group : null });
  }
  if (rpp) files.push({ name: 'project.rpp', data: buildReaperProject({ bpm: ast.bpm, seconds, tracks, mixFile: 'mix.wav', sampleRate: 44100 }) });
  files.push({ name: 'song.pulse', data: code ?? '' });
  files.push({ name: 'README.txt', data: buildReadme({ title: title || 'song', bpm: ast.bpm, seconds, bits, files: files.map((f) => f.name), hasProject: rpp }) });
  onStatus('Creating the ZIP…');
  const zip = await makeZip(files);
  download(zip, `${base}-studio-pack.zip`);
  return { files: files.length, bytes: zip.size };
}

// Rough size of a pack in MB, to warn before rendering very long songs.
export function estimatePackMb(ast, mode, bits) {
  const insts = new Set();
  for (const s of ast.sections) { for (const t of s.tracks) insts.add(t.instrument); if (s.voices?.length) insts.add('voice'); }
  const per = songDuration(ast) * 44100 * 2 * (bits / 8) / 1e6;
  const groups = new Set([...insts].map((n) => groupOf(n)));
  const n = 1 + (mode !== 'group' ? insts.size : 0) + (mode !== 'instrument' ? groups.size : 0);
  return Math.round(per * n);
}
