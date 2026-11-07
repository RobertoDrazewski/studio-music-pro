import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { HttpError } from './http.js';

const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generatePassword(length = 16) {
  let out = '';
  const bytes = crypto.randomBytes(length * 2);
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // El muestreo por rechazo evita el sesgo del módulo.
    const limit = 256 - (256 % PASSWORD_ALPHABET.length);
    if (bytes[i] < limit) out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out.length === length ? out : generatePassword(length);
}

export function createAuth({ db, config }) {
  const { jwtSecret, cookieName, sessionDays, bcryptCost } = config.auth;
  // Sirve para que el tiempo de login sea parecido cuando el email no existe.
  const dummyHash = bcrypt.hashSync('not-a-real-password', bcryptCost);

  const hashPassword = (plain) => bcrypt.hash(plain, bcryptCost);
  const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

  function cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/',
      maxAge: sessionDays * 24 * 60 * 60 * 1000,
    };
  }

  function issueSession(res, user) {
    const token = jwt.sign({ sub: user.id, tv: user.token_version }, jwtSecret, {
      expiresIn: `${sessionDays}d`,
    });
    res.cookie(cookieName, token, cookieOptions());
  }

  function clearSession(res) {
    res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined });
  }

  const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');

  // Pone req.user cuando la sesión es válida. Nunca tira error.
  function loadUser(req, _res, next) {
    const token = req.cookies?.[cookieName];
    if (!token) return next();
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = getUserById.get(payload.sub);
      if (user && user.active && user.token_version === payload.tv) req.user = user;
    } catch {
      // Token inválido o vencido: se trata como anónimo.
    }
    next();
  }

  function requireAuth(req, _res, next) {
    if (!req.user) throw new HttpError(401, 'Authentication required');
    next();
  }

  // Bloquea todo salvo el cambio de contraseña hasta que el usuario ponga la suya.
  function requirePasswordSet(req, _res, next) {
    if (req.user.must_change_password) {
      throw new HttpError(403, 'You must change your temporary password first', { code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    next();
  }

  function requireSuperadmin(req, _res, next) {
    if (req.user?.role !== 'superadmin') throw new HttpError(403, 'Super admin access required');
    next();
  }

  // Crea el primer super admin desde el entorno si todavía no existe ninguno.
  async function seedSuperadmin() {
    const { superadminEmail, superadminPassword, minPasswordLength } = config.auth;
    const existing = db.prepare("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1").get();
    if (existing) return { created: false };
    if (!superadminEmail || !superadminPassword) {
      return { created: false, reason: 'SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD not set' };
    }
    if (superadminPassword.length < Math.max(12, minPasswordLength)) {
      throw new Error('SUPERADMIN_PASSWORD must have at least 12 characters');
    }
    const hash = await hashPassword(superadminPassword);
    db.prepare(
      `INSERT INTO users (email, name, password_hash, role, plan, ai_monthly_quota, master_daily_quota)
       VALUES (?, 'Super Admin', ?, 'superadmin', 'owner', 0, 0)`,
    ).run(superadminEmail, hash);
    return { created: true };
  }

  return {
    hashPassword,
    verifyPassword,
    dummyHash,
    issueSession,
    clearSession,
    loadUser,
    requireAuth,
    requirePasswordSet,
    requireSuperadmin,
    seedSuperadmin,
  };
}
