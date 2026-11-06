import { Router } from 'express';
import { z, validate, HttpError, publicUser } from '../http.js';
import { generatePassword } from '../auth.js';

export function adminRoutes({ db, config, auth, quota }) {
  const router = Router();
  router.use(auth.requireAuth, auth.requirePasswordSet, auth.requireSuperadmin);

  const getUser = db.prepare('SELECT * FROM users WHERE id = ?');

  function withUsage(user) {
    return {
      ...publicUser(user),
      usage: {
        ai: quota.aiStatus(user),
        voice: quota.voiceStatus(user),
        master: quota.masterStatus(user),
        projects: db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(user.id).n,
      },
    };
  }

  router.get('/users', (_req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    res.json({ users: users.map(withUsage) });
  });

  const createSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(200),
    name: z.string().trim().min(1).max(80),
    aiMonthlyQuota: z.number().int().min(0).max(100000).optional(),
    masterDailyQuota: z.number().int().min(0).max(1000).optional(),
    voiceMonthlyQuota: z.number().int().min(0).max(10000).optional(),
    plan: z.string().trim().min(1).max(30).optional(),
  });

  // Creates a user with a temporary password. The password is returned ONCE.
  router.post('/users', async (req, res) => {
    const body = validate(createSchema, req.body);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) {
      throw new HttpError(409, 'A user with that email already exists');
    }
    const temporaryPassword = generatePassword(16);
    const hash = await auth.hashPassword(temporaryPassword);
    const info = db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, plan, must_change_password, ai_monthly_quota, master_daily_quota, voice_monthly_quota)
         VALUES (?, ?, ?, 'user', ?, 1, ?, ?, ?)`,
      )
      .run(
        body.email,
        body.name,
        hash,
        body.plan ?? 'trial',
        body.aiMonthlyQuota ?? config.limits.defaultAiMonthlyQuota,
        body.masterDailyQuota ?? config.limits.defaultMasterDailyQuota,
        body.voiceMonthlyQuota ?? config.limits.defaultVoiceMonthlyQuota,
      );
    const user = getUser.get(info.lastInsertRowid);
    res.status(201).json({ user: withUsage(user), temporaryPassword });
  });

  const patchSchema = z
    .object({
      name: z.string().trim().min(1).max(80),
      active: z.boolean(),
      aiMonthlyQuota: z.number().int().min(0).max(100000),
      masterDailyQuota: z.number().int().min(0).max(1000),
      voiceMonthlyQuota: z.number().int().min(0).max(10000),
      plan: z.string().trim().min(1).max(30),
    })
    .partial();

  function targetUser(req) {
    const user = getUser.get(Number(req.params.id));
    if (!user) throw new HttpError(404, 'User not found');
    return user;
  }

  router.patch('/users/:id', (req, res) => {
    const user = targetUser(req);
    const body = validate(patchSchema, req.body);
    if (user.role === 'superadmin' && body.active === false) {
      throw new HttpError(400, 'The super admin cannot be deactivated');
    }
    const columns = {
      name: 'name',
      active: 'active',
      aiMonthlyQuota: 'ai_monthly_quota',
      masterDailyQuota: 'master_daily_quota',
      voiceMonthlyQuota: 'voice_monthly_quota',
      plan: 'plan',
    };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
      if (body[key] !== undefined) {
        sets.push(`${column} = ?`);
        values.push(typeof body[key] === 'boolean' ? Number(body[key]) : body[key]);
      }
    }
    if (body.active === false) sets.push('token_version = token_version + 1'); // kicks out active sessions
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, user.id);
    res.json({ user: withUsage(getUser.get(user.id)) });
  });

  router.post('/users/:id/reset-password', async (req, res) => {
    const user = targetUser(req);
    if (user.role === 'superadmin') throw new HttpError(400, 'Use the admin:password script for the super admin');
    const temporaryPassword = generatePassword(16);
    const hash = await auth.hashPassword(temporaryPassword);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, token_version = token_version + 1 WHERE id = ?').run(
      hash,
      user.id,
    );
    res.json({ temporaryPassword });
  });

  router.get('/usage', (_req, res) => {
    const budget = quota.budgetStatus();
    const monthStart = quota.monthStartIso();
    const perUser = db
      .prepare(
        `SELECT u.id, u.email, u.name,
                COUNT(a.id) AS requests,
                COALESCE(SUM(a.cost_usd), 0) AS costUsd
           FROM users u
           LEFT JOIN ai_usage a ON a.user_id = u.id AND a.created_at >= ? AND a.ok = 1
          GROUP BY u.id
          ORDER BY costUsd DESC`,
      )
      .all(monthStart)
      .map((r) => ({ ...r, costUsd: Number(r.costUsd.toFixed(4)) }));
    res.json({
      mode: config.appMode,
      budget,
      model: config.openai.model,
      users: perUser,
      jobs: db
        .prepare("SELECT status, COUNT(*) AS n FROM jobs WHERE created_at >= ? GROUP BY status")
        .all(monthStart),
    });
  });

  return router;
}
