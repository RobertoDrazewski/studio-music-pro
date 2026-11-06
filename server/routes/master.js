import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z, validate, HttpError } from '../http.js';
import { looksLikeWav, PRESETS } from '../services/mastering.js';

function slugify(text) {
  const s = String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'song';
}

function jobToApi(row) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    title: row.title,
    error: row.error,
    metrics: row.metrics ? JSON.parse(row.metrics) : null,
    ready: row.status === 'done' && !!row.result_file,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

export function masterRoutes({ db, config, auth, quota, jobs }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requirePasswordSet);

  const { maxUploadMb, maxStems } = config.master;
  fs.mkdirSync(config.tmpDir, { recursive: true });

  // Each request gets its own private directory, removed on failure or when the job ends.
  const storage = multer.diskStorage({
    destination(req, _file, cb) {
      if (!req.uploadDir) {
        req.uploadDir = path.join(config.tmpDir, crypto.randomUUID());
        fs.mkdirSync(req.uploadDir, { recursive: true });
      }
      cb(null, req.uploadDir);
    },
    filename: (_req, _file, cb) => cb(null, crypto.randomUUID() + '.upload'),
  });

  const upload = multer({
    storage,
    limits: { fileSize: maxUploadMb * 1024 * 1024, files: maxStems + 1, fields: 10, fieldSize: config.limits.maxCodeBytes },
    fileFilter(_req, file, cb) {
      const okType = /^audio\/(x-)?(wav|wave|vnd\.wave)$/i.test(file.mimetype);
      if (!okType) return cb(new HttpError(400, 'Only WAV files are accepted'));
      cb(null, true);
    },
  });

  const fields = upload.fields([
    { name: 'mix', maxCount: 1 },
    { name: 'stems', maxCount: maxStems },
  ]);

  const bodySchema = z.object({
    kind: z.enum(['master', 'mp3']).default('master'),
    title: z.string().trim().min(1).max(100).default('Untitled'),
    preset: z.enum(Object.keys(PRESETS)).default('clean'),
    targetLufs: z.coerce.number().min(-23).max(-6).optional(),
    code: z.string().max(config.limits.maxCodeBytes).default(''),
    uploadId: z.string().uuid().optional(),
  });

  const wrapUpload = (req, res, next) => {
    fields(req, res, (err) => {
      if (!err) return next();
      if (req.uploadDir) fs.rmSync(req.uploadDir, { recursive: true, force: true });
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, `File too large (max ${maxUploadMb} MB)`));
      if (err instanceof multer.MulterError) return next(new HttpError(400, `Upload error: ${err.message}`));
      next(err);
    });
  };

  // ---- Upload sessions -----------------------------------------------------------------
  // The browser sends each file in its own request. Cloudflare rejects request bodies over 100 MB,
  // and a song with stems easily exceeds that in a single multipart request.
  const sessions = new Map(); // uploadId -> { userId, dir, createdAt, mix, stems: Map(name -> path) }
  const SESSION_TTL_MS = 60 * 60 * 1000;
  const dropSession = (id) => {
    const s = sessions.get(id);
    if (!s) return;
    fs.rmSync(s.dir, { recursive: true, force: true });
    sessions.delete(id);
  };
  const sweeper = setInterval(() => {
    for (const [id, s] of sessions) if (Date.now() - s.createdAt > SESSION_TTL_MS) dropSession(id);
  }, 10 * 60 * 1000);
  sweeper.unref();

  function ownedSession(req) {
    const s = sessions.get(req.params.id);
    if (!s || s.userId !== req.user.id) throw new HttpError(404, 'Upload session not found or expired');
    return s;
  }

  router.post('/uploads', (req, res) => {
    // Keep at most 3 open sessions per user: the oldest ones are discarded.
    const mine = [...sessions].filter(([, s]) => s.userId === req.user.id).sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (mine.length >= 3) dropSession(mine.shift()[0]);
    const id = crypto.randomUUID();
    const dir = path.join(config.tmpDir, id);
    fs.mkdirSync(dir, { recursive: true });
    sessions.set(id, { userId: req.user.id, dir, createdAt: Date.now(), mix: null, stems: new Map() });
    res.status(201).json({ uploadId: id, maxFileMb: maxUploadMb, maxStems });
  });

  // Streams the request body to disk with a size limit and verifies it is a WAV file.
  async function receiveWav(req, session) {
    if (!/^audio\/(x-)?(wav|wave|vnd\.wave)$/i.test(req.headers['content-type'] ?? '')) {
      throw new HttpError(400, 'Send the file as audio/wav');
    }
    const limit = maxUploadMb * 1024 * 1024;
    if (Number(req.headers['content-length']) > limit) throw new HttpError(413, `File too large (max ${maxUploadMb} MB)`);
    const dest = path.join(session.dir, crypto.randomUUID() + '.upload');
    try {
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(dest);
        let size = 0;
        req.on('data', (chunk) => {
          size += chunk.length;
          if (size > limit) {
            req.unpipe(out);
            out.destroy();
            req.resume();
            reject(new HttpError(413, `File too large (max ${maxUploadMb} MB)`));
          }
        });
        req.on('aborted', () => {
          out.destroy();
          reject(new HttpError(400, 'Upload interrupted'));
        });
        out.on('error', reject);
        out.on('finish', resolve);
        req.pipe(out);
      });
      if (!looksLikeWav(dest)) throw new HttpError(400, 'The file is not a valid WAV');
    } catch (err) {
      fs.rmSync(dest, { force: true });
      throw err;
    }
    return dest;
  }

  router.put('/uploads/:id/mix', async (req, res) => {
    const session = ownedSession(req);
    const file = await receiveWav(req, session);
    if (session.mix) fs.rmSync(session.mix, { force: true });
    session.mix = file;
    res.json({ ok: true });
  });

  router.put('/uploads/:id/stems/:name', async (req, res) => {
    const session = ownedSession(req);
    const name = slugify(req.params.name);
    if (!session.stems.has(name) && session.stems.size >= maxStems) throw new HttpError(400, `At most ${maxStems} stems`);
    const file = await receiveWav(req, session);
    if (session.stems.has(name)) fs.rmSync(session.stems.get(name), { force: true });
    session.stems.set(name, file);
    res.json({ ok: true, name });
  });

  // Starts a job. Files come either from an upload session (JSON body with `uploadId`)
  // or from a single multipart request (fields "mix" and "stems"), handy for scripts and small files.
  router.post('/', wrapUpload, (req, res) => {
    let uploadDir = req.uploadDir;
    let fromSession = null;
    // A failed multipart request is cleaned up right away; an upload session is kept so the
    // browser can retry without sending everything again (the TTL sweeper removes it eventually).
    const cleanup = () => !fromSession && uploadDir && fs.rmSync(uploadDir, { recursive: true, force: true });
    try {
      const body = validate(bodySchema, req.body);

      let mixPath;
      let stems;
      if (body.uploadId) {
        const session = sessions.get(body.uploadId);
        if (!session || session.userId !== req.user.id) throw new HttpError(404, 'Upload session not found or expired');
        fromSession = body.uploadId;
        uploadDir = session.dir;
        if (!session.mix) throw new HttpError(400, 'Missing mix file');
        mixPath = session.mix;
        stems = [...session.stems].map(([name, file]) => ({ name: `${name}.wav`, path: file }));
      } else {
        const mixFile = req.files?.mix?.[0];
        if (!mixFile) throw new HttpError(400, 'Missing "mix" file');
        const stemFiles = req.files?.stems ?? [];
        for (const f of [mixFile, ...stemFiles]) {
          if (!looksLikeWav(f.path)) throw new HttpError(400, `"${f.originalname}" is not a valid WAV file`);
        }
        mixPath = mixFile.path;
        // Stem names are sanitized and made unique; they end up inside the ZIP.
        const used = new Set();
        stems = stemFiles.map((f, i) => {
          const base = slugify(path.parse(f.originalname).name) || `stem-${i + 1}`;
          let name = `${base}.wav`;
          let n = 2;
          while (used.has(name)) name = `${base}-${n++}.wav`;
          used.add(name);
          return { name, path: f.path };
        });
      }

      if (body.kind === 'master') {
        const status = quota.masterStatus(req.user);
        if (status.remaining !== null && status.remaining <= 0) {
          throw new HttpError(429, 'You used all your masters for today', { code: 'MASTER_QUOTA_EXCEEDED' });
        }
      }

      const id = crypto.randomUUID();
      db.prepare("INSERT INTO jobs (id, user_id, kind, status, title) VALUES (?, ?, ?, 'queued', ?)").run(
        id,
        req.user.id,
        body.kind,
        body.title,
      );
      jobs.enqueue({
        id,
        kind: body.kind,
        title: body.title,
        slug: slugify(body.title),
        preset: body.preset,
        targetLufs: body.targetLufs,
        code: body.code,
        mix: mixPath,
        stems,
        uploadDir,
      });
      if (fromSession) sessions.delete(fromSession); // the job owns the files from now on
      res.status(202).json({ job: jobToApi(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)) });
    } catch (err) {
      cleanup();
      throw err;
    }
  });

  router.get('/presets', (_req, res) => {
    res.json({
      presets: Object.entries(PRESETS).map(([id, p]) => ({ id, description: p.description, targetLufs: p.targetLufs })),
    });
  });

  router.get('/jobs', (req, res) => {
    const rows = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(req.user.id);
    res.json({ jobs: rows.map(jobToApi) });
  });

  function ownedJob(req) {
    const row = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) throw new HttpError(404, 'Job not found');
    return row;
  }

  router.get('/jobs/:id', (req, res) => {
    res.json({ job: jobToApi(ownedJob(req)) });
  });

  router.get('/jobs/:id/download', (req, res) => {
    const row = ownedJob(req);
    if (row.status !== 'done' || !row.result_file) throw new HttpError(409, 'The file is not available (not finished or expired)');
    const file = path.join(jobs.jobDir(row.id), path.basename(row.result_file));
    if (!fs.existsSync(file)) throw new HttpError(410, 'The file has expired');
    res.download(file, path.basename(row.result_file));
  });

  return router;
}
