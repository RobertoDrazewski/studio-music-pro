import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Validates `data` against a zod schema or throws a 400 HttpError.
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(400, `${field}${issue.message}`);
  }
  return result.data;
}

export { z };

// The demo plan ('trial') lets a person try the studio: one song, no downloads.
// Paid plans (and the super admin) have no such limits. Payments come later.
export const isDemoUser = (u) => u.role !== 'superadmin' && u.plan === 'trial';
export const DEMO_MAX_PROJECTS = 1;

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatar: u.avatar ?? null,
    role: u.role,
    plan: u.plan,
    limits: isDemoUser(u) ? { maxProjects: DEMO_MAX_PROJECTS, canDownload: false } : { maxProjects: null, canDownload: true },
    active: !!u.active,
    mustChangePassword: !!u.must_change_password,
    aiMonthlyQuota: u.ai_monthly_quota,
    masterDailyQuota: u.master_daily_quota,
    voiceMonthlyQuota: u.voice_monthly_quota,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}
