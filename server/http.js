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

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    plan: u.plan,
    active: !!u.active,
    mustChangePassword: !!u.must_change_password,
    aiMonthlyQuota: u.ai_monthly_quota,
    masterDailyQuota: u.master_daily_quota,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}
