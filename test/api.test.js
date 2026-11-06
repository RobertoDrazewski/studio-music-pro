import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, startFakeOpenAI, client, loginAdmin, createUser, ADMIN } from './helpers.js';

const VALID = 'bpm 120\nsection main 8\n  kick "x . . . x . . ."\n  bass "c2 . eb2 ." saw';
const INVALID = 'bpm 120\nkick "x . . ."\nlaser "x"';

let fake;
let app;

before(async () => {
  fake = await startFakeOpenAI();
  app = await startApp({ openaiUrl: fake.url, config: { openai: { monthlyBudgetUsd: 1 } } });
});

after(async () => {
  await app.stop();
  await fake.close();
});

test('health is public and anonymous requests are rejected elsewhere', async () => {
  const c = client(app.base);
  assert.equal((await c.get('/api/health')).status, 200);
  assert.equal((await c.get('/api/projects')).status, 401);
  assert.equal((await c.get('/api/admin/users')).status, 401);
  assert.equal((await c.get('/api/nope')).status, 404);
});

test('login: wrong password and unknown email give the same error', async () => {
  const c = client(app.base);
  const a = await c.post('/api/auth/login', { email: ADMIN.email, password: 'wrong-password' });
  const b = await c.post('/api/auth/login', { email: 'ghost@example.com', password: 'wrong-password' });
  assert.equal(a.status, 401);
  assert.equal(b.status, 401);
  assert.equal(a.data.error, b.data.error);
});

test('session cookie is httpOnly and sameSite=lax', async () => {
  const c = client(app.base);
  const r = await c.post('/api/auth/login', ADMIN);
  const cookie = r.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.equal((await c.get('/api/auth/me')).data.user.role, 'superadmin');
});

test('cross-origin writes are rejected', async () => {
  const admin = await loginAdmin(app.base);
  const r = await admin.raw('POST', '/api/projects', { title: 'x', code: 'y' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('super admin creates users; users cannot use the app until they change the temporary password', async () => {
  const admin = await loginAdmin(app.base);
  const created = await admin.post('/api/admin/users', { email: 'Ana@Example.com', name: 'Ana', aiMonthlyQuota: 3 });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.email, 'ana@example.com');
  assert.equal(created.data.user.aiMonthlyQuota, 3);
  assert.ok(created.data.temporaryPassword.length >= 16);
  assert.equal((await admin.post('/api/admin/users', { email: 'ana@example.com', name: 'Dup' })).status, 409);

  const ana = client(app.base);
  const login = await ana.post('/api/auth/login', { email: 'ana@example.com', password: created.data.temporaryPassword });
  assert.equal(login.data.user.mustChangePassword, true);
  const blocked = await ana.get('/api/projects');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'PASSWORD_CHANGE_REQUIRED');

  const short = await ana.post('/api/auth/change-password', { currentPassword: created.data.temporaryPassword, newPassword: 'short' });
  assert.equal(short.status, 400);
  const ok = await ana.post('/api/auth/change-password', {
    currentPassword: created.data.temporaryPassword,
    newPassword: 'a-much-better-password',
  });
  assert.equal(ok.status, 200);
  assert.equal((await ana.get('/api/projects')).status, 200);
});

test('regular users cannot reach the admin API', async () => {
  const admin = await loginAdmin(app.base);
  const { client: user } = await createUser(app.base, admin, { email: 'plain@example.com' });
  assert.equal((await user.get('/api/admin/users')).status, 403);
  assert.equal((await user.post('/api/admin/users', { email: 'x@example.com', name: 'X' })).status, 403);
});

test('deactivating a user kills their session; reset-password issues a new one', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'temp@example.com' });
  assert.equal((await u.client.get('/api/projects')).status, 200);

  await admin.patch(`/api/admin/users/${u.id}`, { active: false });
  assert.equal((await u.client.get('/api/projects')).status, 401);
  const relog = await client(app.base).post('/api/auth/login', { email: u.email, password: u.password });
  assert.equal(relog.status, 401);

  await admin.patch(`/api/admin/users/${u.id}`, { active: true });
  const reset = await admin.post(`/api/admin/users/${u.id}/reset-password`);
  assert.equal(reset.status, 200);
  const again = client(app.base);
  const login = await again.post('/api/auth/login', { email: u.email, password: reset.data.temporaryPassword });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.mustChangePassword, true);
});

test('super admin cannot be deactivated through the API', async () => {
  const admin = await loginAdmin(app.base);
  const me = (await admin.get('/api/auth/me')).data.user;
  assert.equal((await admin.patch(`/api/admin/users/${me.id}`, { active: false })).status, 400);
});

test('projects: CRUD, ownership isolation and sharing', async () => {
  const admin = await loginAdmin(app.base);
  const a = await createUser(app.base, admin, { email: 'pa@example.com', name: 'Paula' });
  const b = await createUser(app.base, admin, { email: 'pb@example.com', name: 'Pedro' });

  const created = await a.client.post('/api/projects', { title: 'My track', code: VALID });
  assert.equal(created.status, 201);
  const id = created.data.project.id;

  assert.equal((await b.client.get(`/api/projects/${id}`)).status, 404);
  assert.equal((await b.client.put(`/api/projects/${id}`, { code: 'x' })).status, 404);
  assert.equal((await b.client.del(`/api/projects/${id}`)).status, 404);

  const saved = await a.client.put(`/api/projects/${id}`, { code: INVALID });
  assert.equal(saved.status, 200, 'work in progress is saved even with errors');
  assert.equal(saved.data.validation.ok, false);
  assert.ok(saved.data.validation.errors.length > 0);

  const list = await a.client.get('/api/projects');
  assert.equal(list.data.projects.length, 1);
  assert.equal(list.data.projects[0].code, undefined, 'list does not include code');

  // sharing
  const anon = client(app.base);
  const shared = await a.client.post(`/api/projects/${id}/share`, { enabled: true });
  const slug = shared.data.project.shareSlug;
  assert.ok(slug);
  const pub = await anon.get(`/api/share/${slug}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.song.author, 'Paula');
  assert.equal(pub.data.song.code, INVALID);
  assert.equal(pub.data.song.id, undefined);
  assert.equal(pub.data.song.email, undefined);

  await a.client.post(`/api/projects/${id}/share`, { enabled: false });
  assert.equal((await anon.get(`/api/share/${slug}`)).status, 404);
  assert.equal((await anon.get('/api/share/../etc')).status, 404);

  assert.equal((await a.client.del(`/api/projects/${id}`)).status, 200);
});

test('project limits: code size', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'big@example.com' });
  const r = await u.client.post('/api/projects', { title: 'big', code: 'x'.repeat(60_000) });
  assert.equal(r.status, 400);
});

test('AI: generates valid code, strips markdown fences and enforces the per-user quota', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai1@example.com', aiMonthlyQuota: 2 });

  fake.state.replies.push('```pulse\n' + VALID + '\n```');
  const r1 = await u.client.post('/api/ai/generate', { prompt: 'dark techno with a deep bass' });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.code, VALID);
  assert.equal(r1.data.quota.remaining, 1);

  // the key and the language guide are sent to the provider, never to the browser
  const sent = fake.state.requests.at(-1);
  assert.equal(sent.headers.authorization, 'Bearer sk-test');
  assert.match(sent.body.messages[0].content, /Pulse is a tiny live-coding/);
  assert.ok(!JSON.stringify(r1.data).includes('sk-test'));

  fake.state.replies.push(VALID);
  assert.equal((await u.client.post('/api/ai/generate', { prompt: 'house track' })).status, 200);

  const third = await u.client.post('/api/ai/generate', { prompt: 'one more please' });
  assert.equal(third.status, 429);
  assert.equal(third.data.code, 'AI_QUOTA_EXCEEDED');
  assert.equal((await u.client.get('/api/auth/me')).data.quota.ai.remaining, 0);
});

test('AI: repairs invalid output once, fails cleanly if still invalid and does not charge the quota', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai2@example.com', aiMonthlyQuota: 5 });

  fake.state.replies.push(INVALID, VALID);
  const repaired = await u.client.post('/api/ai/generate', { prompt: 'something chill' });
  assert.equal(repaired.status, 200);
  assert.equal(repaired.data.code, VALID);
  const repairMessage = fake.state.requests.at(-1).body.messages[1].content;
  assert.match(repairMessage, /laser/);

  fake.state.replies.push(INVALID, INVALID);
  const failed = await u.client.post('/api/ai/generate', { prompt: 'something broken' });
  assert.equal(failed.status, 502);
  assert.equal(failed.data.code, 'AI_INVALID_OUTPUT');
  assert.equal((await u.client.get('/api/auth/me')).data.quota.ai.used, 1);
});

test('AI: reasoning effort is only sent when configured', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai-eff@example.com' });
  fake.state.replies.push(VALID);
  await u.client.post('/api/ai/generate', { prompt: 'plain request' });
  assert.equal(fake.state.requests.at(-1).body.reasoning_effort, undefined);

  const withEffort = await startApp({ openaiUrl: fake.url, config: { openai: { reasoningEffort: 'low' } } });
  try {
    const a = await loginAdmin(withEffort.base);
    fake.state.replies.push(VALID);
    const r = await a.post('/api/ai/generate', { prompt: 'plain request' });
    assert.equal(r.status, 200);
    assert.equal(fake.state.requests.at(-1).body.reasoning_effort, 'low');
  } finally {
    await withEffort.stop();
  }
});

test('AI: editing mode sends the current code', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai3@example.com' });
  fake.state.replies.push(VALID);
  const r = await u.client.post('/api/ai/generate', { prompt: 'make the bass heavier', code: 'bpm 90\nkick "x . . ."' });
  assert.equal(r.status, 200);
  assert.match(fake.state.requests.at(-1).body.messages[1].content, /bpm 90/);
});

test('AI: provider errors are not leaked and do not consume quota', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai4@example.com' });
  fake.state.replies.push(() => ({ status: 401, body: { error: { message: 'Incorrect API key provided: sk-secret-1234' } } }));
  const r = await u.client.post('/api/ai/generate', { prompt: 'any song' });
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.data).includes('sk-secret'));
  assert.equal((await u.client.get('/api/auth/me')).data.quota.ai.used, 0);
});

test('AI: input validation', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai5@example.com' });
  assert.equal((await u.client.post('/api/ai/generate', { prompt: 'a' })).status, 400);
  assert.equal((await u.client.post('/api/ai/generate', { prompt: 'x'.repeat(700) })).status, 400);
  assert.equal((await client(app.base).post('/api/ai/generate', { prompt: 'valid prompt' })).status, 401);
});

test('AI: global monthly budget stops generation for everyone', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'ai6@example.com', aiMonthlyQuota: 50 });
  app.db.prepare("INSERT INTO ai_usage (user_id, model, cost_usd, ok) VALUES (?, 'm', 5, 1)").run(u.id);
  const r = await u.client.post('/api/ai/generate', { prompt: 'a song please' });
  assert.equal(r.status, 503);
  assert.equal(r.data.code, 'AI_BUDGET_EXCEEDED');
  const usage = await admin.get('/api/admin/usage');
  assert.equal(usage.data.budget.exceeded, true);
});

test('admin usage summary lists users', async () => {
  const admin = await loginAdmin(app.base);
  const usage = await admin.get('/api/admin/usage');
  assert.equal(usage.status, 200);
  assert.ok(usage.data.users.length >= 1);
  assert.equal(usage.data.mode, 'trial');
});

test('language guide requires login', async () => {
  const admin = await loginAdmin(app.base);
  assert.equal((await client(app.base).get('/api/ai/guide')).status, 401);
  assert.match((await admin.get('/api/ai/guide')).data.guide, /GLOBAL COMMANDS/);
});
