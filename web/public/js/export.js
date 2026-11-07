// Flujo de exportación: renderizo la canción en el navegador, subo el audio, espero el trabajo del servidor y descargo el resultado.
import { api } from './api.js';
import { renderProject, renderSong, encodeWav, songDuration } from './engine.js';
import { download } from './dom.js';
import { MAX_AUDIO_SECONDS } from './config.js';
import { makeZip } from './zip.js';
import { groupOf } from '/shared/lang/promptbuilder.js';
import { buildReaperProject, buildReadme } from '/shared/lang/reaper.js';

const UPLOAD_BUDGET_BYTES = 90 * 1024 * 1024; // cada archivo debe quedar por debajo del límite del servidor (95 MB)

export const safeName = (title) =>
  (title || 'song')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'song';

// 24 bits si entra en una sola subida, 16 bits para canciones muy largas.
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

// WAV simple directo desde el navegador, sin servidor.
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

// kind: 'master' (ZIP con archivos masterizados, mezcla y stems) o 'mp3' (MP3 simple de la mezcla).
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

// Un stem (un instrumento o un grupo entero) como WAV, renderizado en el navegador. Sin servidor y sin cuota.
export async function exportStem(ast, title, names, label, onStatus = () => {}) {
  checkLength(ast);
  onStatus(`Rendering ${label}…`);
  const buffer = await renderSong(ast, { only: names });
  download(encodeWav(buffer, 24), `${safeName(title)}-${safeName(label)}.wav`);
}

// Pack de estudio: ZIP con la mezcla, los stems, un proyecto de Reaper y un README corto. Todo queda en el navegador.
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

// Tamaño aproximado de un pack en MB, para avisar antes de renderizar canciones muy largas.
export function estimatePackMb(ast, mode, bits) {
  const insts = new Set();
  for (const s of ast.sections) { for (const t of s.tracks) insts.add(t.instrument); if (s.voices?.length) insts.add('voice'); }
  const per = songDuration(ast) * 44100 * 2 * (bits / 8) / 1e6;
  const groups = new Set([...insts].map((n) => groupOf(n)));
  const n = 1 + (mode !== 'group' ? insts.size : 0) + (mode !== 'instrument' ? groups.size : 0);
  return Math.round(per * n);
}
