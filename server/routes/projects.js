import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z, validate, HttpError } from '../http.js';
import { parse } from '../../shared/lang/parser.js';

function toApi(row, { withCode = true } = {}) {
  const out = {
    id: row.id,
    title: row.title,
    shared: !!row.share_slug,
    shareSlug: row.share_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withCode) out.code = row.code;
  return out;
}

export function projectRoutes({ db, config, auth }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requirePasswordSet);

  const { maxCodeBytes, maxProjectsPerUser } = config.limits;

  const bodySchema = z.object({
    title: z.string().trim().min(1).max(100),
    code: z.string().max(maxCodeBytes, 'Code is too large'),
  });

  function owned(req) {
    const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) throw new HttpError(404, 'Project not found');
    return row;
  }

  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
    res.json({ projects: rows.map((r) => toApi(r, { withCode: false })) });
  });

  router.post('/', (req, res) => {
    const { title, code } = validate(bodySchema, req.body);
    const count = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(req.user.id).n;
    if (count >= maxProjectsPerUser) throw new HttpError(403, `Project limit reached (${maxProjectsPerUser})`);
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO projects (id, user_id, title, code) VALUES (?, ?, ?, ?)').run(id, req.user.id, title, code);
    res.status(201).json({ project: toApi(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)) });
  });

  router.get('/:id', (req, res) => {
    res.json({ project: toApi(owned(req)) });
  });

  // Work in progress may contain errors, so the code is saved as is.
  // The response includes the validation result so the editor can show it.
  router.put('/:id', (req, res) => {
    const row = owned(req);
    const { title, code } = validate(bodySchema.partial(), req.body);
    db.prepare(
      "UPDATE projects SET title = ?, code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(title ?? row.title, code ?? row.code, row.id);
    const fresh = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.id);
    const check = parse(fresh.code);
    res.json({ project: toApi(fresh), validation: { ok: check.ok, errors: check.errors, warnings: check.warnings } });
  });

  router.delete('/:id', (req, res) => {
    const row = owned(req);
    db.prepare('DELETE FROM projects WHERE id = ?').run(row.id);
    res.json({ ok: true });
  });

  router.post('/:id/share', (req, res) => {
    const row = owned(req);
    const { enabled } = validate(z.object({ enabled: z.boolean() }), req.body);
    let slug = null;
    if (enabled) slug = row.share_slug ?? crypto.randomBytes(9).toString('base64url');
    db.prepare('UPDATE projects SET share_slug = ? WHERE id = ?').run(slug, row.id);
    res.json({ project: toApi(db.prepare('SELECT * FROM projects WHERE id = ?').get(row.id)) });
  });

  return router;
}

// Public, read-only access to shared songs. No authentication.
export function shareRoutes({ db }) {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests' },
    }),
  );

  router.get('/:slug', (req, res) => {
    if (!/^[A-Za-z0-9_-]{6,40}$/.test(req.params.slug)) throw new HttpError(404, 'Song not found');
    const row = db
      .prepare(
        `SELECT p.title, p.code, p.updated_at, u.name AS author
           FROM projects p JOIN users u ON u.id = p.user_id
          WHERE p.share_slug = ? AND u.active = 1`,
      )
      .get(req.params.slug);
    if (!row) throw new HttpError(404, 'Song not found');
    res.json({ song: { title: row.title, code: row.code, author: row.author, updatedAt: row.updated_at } });
  });

  return router;
}
