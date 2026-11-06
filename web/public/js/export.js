// Export flow: render the song in the browser, upload the audio, wait for the server job, download the result.
import { api } from './api.js';
import { renderProject, renderSong, encodeWav, songDuration } from './engine.js';
import { download } from './dom.js';
import { MAX_AUDIO_SECONDS } from './config.js';

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
