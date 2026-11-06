import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

// In-process job queue backed by the `jobs` table. Mastering is CPU heavy, so
// only `concurrency` jobs run at the same time; the rest wait in the queue.
export function createJobs({ db, config, mastering }) {
  const waiting = [];
  let running = 0;
  const { concurrency, jobTtlHours } = config.master;

  const setStatus = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
  const finishDone = db.prepare(
    "UPDATE jobs SET status = 'done', result_file = ?, metrics = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  );
  const finishFailed = db.prepare(
    "UPDATE jobs SET status = 'failed', error = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  );

  // A restart loses the queue: anything unfinished is reported as failed instead of hanging forever.
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = 'The server restarted before this job finished', finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status IN ('queued','running')",
  ).run();

  const jobDir = (id) => path.join(config.jobsDir, id);

  function enqueue(job) {
    waiting.push(job);
    pump();
  }

  function pump() {
    while (running < concurrency && waiting.length) {
      const job = waiting.shift();
      running++;
      setStatus.run('running', job.id);
      execute(job)
        .catch((err) => {
          console.error(`[jobs] ${job.id} failed:`, err.message);
          // Do not leak ffmpeg internals to the client.
          const safe = err.status ? err.message : 'Processing failed. Try again or use a different file.';
          finishFailed.run(safe, job.id);
          fs.rmSync(jobDir(job.id), { recursive: true, force: true });
        })
        .finally(() => {
          // Uploaded sources are always removed once the job ends.
          fs.rmSync(job.uploadDir, { recursive: true, force: true });
          running--;
          pump();
        });
    }
  }

  async function execute(job) {
    const dir = jobDir(job.id);
    fs.mkdirSync(dir, { recursive: true });

    if (job.kind === 'mp3') {
      const out = path.join(dir, `${job.slug}.mp3`);
      const metrics = await mastering.toMp3({ input: job.mix, outMp3: out });
      finishDone.run(path.basename(out), JSON.stringify(metrics), job.id);
      return;
    }

    const outWav = path.join(dir, `${job.slug}-master.wav`);
    const outMp3 = path.join(dir, `${job.slug}-master.mp3`);
    const metrics = await mastering.master({
      input: job.mix,
      outWav,
      outMp3,
      preset: job.preset,
      targetLufs: job.targetLufs,
    });
    const zipName = `${job.slug}-project.zip`;
    await buildZip({ zipPath: path.join(dir, zipName), job, outWav, outMp3, metrics });
    // The individual outputs are already inside the ZIP.
    fs.rmSync(outWav, { force: true });
    fs.rmSync(outMp3, { force: true });
    finishDone.run(zipName, JSON.stringify(metrics), job.id);
  }

  function buildZip({ zipPath, job, outWav, outMp3, metrics }) {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 1 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);

      archive.file(outWav, { name: `master/${job.slug}-master.wav` });
      archive.file(outMp3, { name: `master/${job.slug}-master.mp3` });
      archive.file(job.mix, { name: `mix/${job.slug}-mix.wav` });
      for (const stem of job.stems) archive.file(stem.path, { name: `stems/${stem.name}` });
      archive.append(job.code || '// (no code attached)\n', { name: `project/${job.slug}.pulse` });
      archive.append(readme({ job, metrics }), { name: 'README.txt' });
      archive.finalize();
    });
  }

  function readme({ job, metrics }) {
    return [
      `${job.title}`,
      '='.repeat(Math.max(3, job.title.length)),
      '',
      'Contents',
      '  master/   Mastered WAV (24-bit / 44.1 kHz) and MP3 (320 kbps)',
      '  mix/      The unprocessed mix as rendered in the studio',
      '  stems/    Individual instrument tracks, unprocessed',
      '  project/  The song source code (.pulse), open it in the studio to keep editing',
      '',
      'Mastering report',
      `  Preset:            ${metrics.preset}`,
      `  Target loudness:   ${metrics.targetLufs} LUFS`,
      `  Input loudness:    ${metrics.inputLufs} LUFS`,
      `  Output loudness:   ${metrics.outputLufs} LUFS`,
      `  Output true peak:  ${metrics.outputTruePeakDb} dBTP`,
      `  Duration:          ${metrics.durationSeconds} s`,
      '',
      `Created: ${new Date().toISOString()}`,
      '',
    ].join('\n');
  }

  function cleanupExpired() {
    const cutoff = new Date(Date.now() - jobTtlHours * 3600 * 1000).toISOString();
    const old = db.prepare("SELECT id FROM jobs WHERE created_at < ? AND status IN ('done','failed') AND result_file IS NOT NULL").all(cutoff);
    for (const { id } of old) {
      fs.rmSync(jobDir(id), { recursive: true, force: true });
      db.prepare("UPDATE jobs SET result_file = NULL, error = COALESCE(error, 'Expired') WHERE id = ?").run(id);
    }
    // Orphaned temp uploads (e.g. crash mid-upload) older than the TTL.
    if (fs.existsSync(config.tmpDir)) {
      for (const entry of fs.readdirSync(config.tmpDir)) {
        const p = path.join(config.tmpDir, entry);
        try {
          if (fs.statSync(p).mtimeMs < Date.now() - jobTtlHours * 3600 * 1000) fs.rmSync(p, { recursive: true, force: true });
        } catch {
          // ignore races
        }
      }
    }
  }

  const timer = setInterval(cleanupExpired, 60 * 60 * 1000);
  timer.unref();

  return { enqueue, jobDir, cleanupExpired, queueLength: () => waiting.length, stop: () => clearInterval(timer) };
}
