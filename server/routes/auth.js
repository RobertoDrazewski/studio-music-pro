import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z, validate, HttpError, publicUser } from '../http.js';

export function authRoutes({ db, config, auth, quota }) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in a few minutes.' },
    skipSuccessfulRequests: true,
  });

  const loginSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(200),
    password: z.string().min(1).max(200),
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Always run bcrypt so timing does not reveal whether the email exists.
    const ok = await auth.verifyPassword(password, user ? user.password_hash : auth.dummyHash);
    if (!user || !ok || !user.active) throw new HttpError(401, 'Invalid email or password');

    db.prepare("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(user.id);
    auth.issueSession(res, user);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (_req, res) => {
    auth.clearSession(res);
    res.json({ ok: true });
  });

  router.get('/me', auth.requireAuth, (req, res) => {
    res.json({
      user: publicUser(req.user),
      mode: config.appMode,
      quota: {
        ai: quota.aiStatus(req.user),
        master: quota.masterStatus(req.user),
        voice: quota.voiceStatus(req.user),
      },
    });
  });

  // Profile: display name and picture. The picture is a small image resized in the browser (data URL).
  const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  const profileSchema = z.object({
    name: z.string().trim().min(1, 'Enter a name').max(80).optional(),
    avatar: z.union([z.string().max(60_000).regex(AVATAR_RE, 'The picture must be a PNG, JPEG or WebP image'), z.null()]).optional(),
  });
  router.patch('/profile', auth.requireAuth, (req, res) => {
    const body = validate(profileSchema, req.body);
    if (body.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, req.user.id);
    if (body.avatar !== undefined) db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(body.avatar, req.user.id);
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(fresh) });
  });

  const changeSchema = z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(config.auth.minPasswordLength, `Use at least ${config.auth.minPasswordLength} characters`).max(200),
  });

  router.post('/change-password', auth.requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = validate(changeSchema, req.body);
    if (!(await auth.verifyPassword(currentPassword, req.user.password_hash))) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    if (currentPassword === newPassword) throw new HttpError(400, 'The new password must be different');
    const hash = await auth.hashPassword(newPassword);
    // Bumping token_version signs out every other session.
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?').run(
      hash,
      req.user.id,
    );
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    auth.issueSession(res, fresh);
    res.json({ ok: true });
  });

  return router;
}
