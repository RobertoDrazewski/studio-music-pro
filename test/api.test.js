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
  const r1 = await u.client.post('/api/ai/generate', { prompt: 'dark and heavy with a deep bass' });
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
  const repaired = await u.client.post('/api/ai/generate', { prompt: 'something calm and warm' });
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
  assert.equal((await u.client.post('/api/ai/generate', { prompt: 'x'.repeat(1600) })).status, 400);
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

test('AI: style detection adds the style brief and the tempo guard fixes the tempo', async () => {
  const big = await startApp({ openaiUrl: fake.url, env: { AI_MONTHLY_BUDGET_USD: '1000' } });
  const admin = await loginAdmin(big.base);
  const u = await createUser(big.base, admin, { email: 'ai-style@example.com', aiMonthlyQuota: 10 });
  try {

  // VALID is at 120 bpm: a reggae dub must not stay there.
  fake.state.replies.push(VALID);
  const dub = await u.client.post('/api/ai/generate', { prompt: 'quiero un reggae dub lento' });
  assert.equal(dub.status, 200);
  assert.equal(dub.data.style, 'dub');
  assert.equal(dub.data.tempoAdjusted, true);
  assert.match(dub.data.code, /^bpm 70$/m);
  const userMsg = fake.state.requests.at(-1).body.messages[1].content;
  assert.match(userMsg, /STYLE: Reggae Dub/);
  assert.match(userMsg, /ONE DROP/);

  // An explicit tempo from the user wins over the style.
  fake.state.replies.push(VALID);
  const explicit = await u.client.post('/api/ai/generate', { prompt: 'techno at 140 bpm' });
  assert.match(explicit.data.code, /^bpm 140$/m);

  // The style picker overrides detection; "none" turns the style off.
  fake.state.replies.push(VALID);
  const picked = await u.client.post('/api/ai/generate', { prompt: 'something nice', style: 'drum-and-bass' });
  assert.equal(picked.data.style, 'drum-and-bass');
  assert.match(picked.data.code, /^bpm 174$/m);

  fake.state.replies.push(VALID);
  const none = await u.client.post('/api/ai/generate', { prompt: 'a house track', style: 'none' });
  assert.equal(none.data.style, null);
  assert.match(none.data.code, /^bpm 120$/m);

  assert.equal((await u.client.post('/api/ai/generate', { prompt: 'anything', style: 'polka' })).status, 400);
  } finally {
    await big.stop();
  }
});

test('AI voices: cache is free, quota counts only generated clips, budget and validation apply', async () => {
  const big = await startApp({ openaiUrl: fake.url, env: { AI_MONTHLY_BUDGET_USD: '1000' } });
  const admin = await loginAdmin(big.base);
  const u = await createUser(big.base, admin, { email: 'voice1@example.com', voiceMonthlyQuota: 2 });
  try {
    const before = fake.state.requests.length;

    // Never generated: onlyCached must answer 404 and spend nothing.
    const miss = await u.client.post('/api/ai/voice', { text: 'Jah love', voice: 'male', onlyCached: true });
    assert.equal(miss.status, 404);
    assert.equal(miss.data.code, 'VOICE_NOT_CACHED');
    assert.equal(fake.state.requests.length, before);

    // First real generation calls OpenAI with the mapped voice and the style as instructions.
    const a = await u.client.post('/api/ai/voice', { text: 'Jah love', voice: 'male', style: 'slow and deep' });
    assert.equal(a.status, 200);
    assert.equal(a.headers.get('content-type'), 'audio/mpeg');
    assert.equal(a.headers.get('x-voice-cached'), '0');
    assert.ok(a.data.byteLength > 100);
    const sent = fake.state.requests.at(-1);
    assert.match(sent.url, /audio\/speech$/);
    assert.equal(sent.body.voice, big.config.openai.ttsVoiceMale);
    assert.equal(sent.body.instructions, 'slow and deep');

    // Same phrase again: served from cache, no new OpenAI call, no quota used.
    const again = await u.client.post('/api/ai/voice', { text: 'Jah love', voice: 'male', style: 'slow and deep' });
    assert.equal(again.headers.get('x-voice-cached'), '1');
    const peek = await u.client.post('/api/ai/voice', { text: 'Jah love', voice: 'male', style: 'slow and deep', onlyCached: true });
    assert.equal(peek.status, 200);
    assert.equal(fake.state.requests.length, before + 1);

    // Quota: 2 per month, the cached replay did not count.
    assert.equal((await u.client.post('/api/ai/voice', { text: 'One love', voice: 'female' })).status, 200);
    const over = await u.client.post('/api/ai/voice', { text: 'Third phrase', voice: 'female' });
    assert.equal(over.status, 429);
    assert.equal(over.data.code, 'VOICE_QUOTA_EXCEEDED');
    // A cached clip is still playable after the quota ran out.
    assert.equal((await u.client.post('/api/ai/voice', { text: 'One love', voice: 'female' })).status, 200);

    const me = await u.client.get('/api/auth/me');
    assert.equal(me.data.quota.voice.used, 2);
    assert.equal(me.data.quota.voice.remaining, 0);

    // Validation.
    assert.equal((await u.client.post('/api/ai/voice', { text: '', voice: 'female' })).status, 400);
    assert.equal((await u.client.post('/api/ai/voice', { text: 'x'.repeat(201), voice: 'female' })).status, 400);
    assert.equal((await u.client.post('/api/ai/voice', { text: 'hola', voice: 'robot' })).status, 400);
  } finally {
    await big.stop();
  }
});

test('AI voices: counted in the global budget, admin can set the voice quota', async () => {
  const tiny = await startApp({ openaiUrl: fake.url, env: { AI_MONTHLY_BUDGET_USD: '0.0001' } });
  const admin = await loginAdmin(tiny.base);
  const u = await createUser(tiny.base, admin, { email: 'voice2@example.com', voiceMonthlyQuota: 5 });
  try {
    assert.equal((await u.client.post('/api/ai/voice', { text: 'a'.repeat(100), voice: 'female' })).status, 200);
    const blocked = await u.client.post('/api/ai/voice', { text: 'another phrase', voice: 'female' });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.data.code, 'AI_BUDGET_EXCEEDED');

    const list = await admin.get('/api/admin/users');
    const row = list.data.users.find((x) => x.email === 'voice2@example.com');
    assert.equal(row.voiceMonthlyQuota, 5);
    assert.equal(row.usage.voice.used, 1);
    const patched = await admin.patch(`/api/admin/users/${row.id}`, { voiceMonthlyQuota: 9 });
    assert.equal(patched.data.user.voiceMonthlyQuota, 9);
  } finally {
    await tiny.stop();
  }
});

test('profile: name and picture can be changed, invalid pictures are rejected', async () => {
  const admin = await loginAdmin(app.base);
  const u = await createUser(app.base, admin, { email: 'pic@example.com', name: 'Pic' });
  const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const ok = await u.client.patch('/api/auth/profile', { name: 'Pic Updated', avatar: tiny });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.name, 'Pic Updated');
  assert.equal(ok.data.user.avatar, tiny);
  assert.equal((await u.client.get('/api/auth/me')).data.user.avatar, tiny);
  assert.equal((await u.client.patch('/api/auth/profile', { avatar: 'data:text/html;base64,AAAA' })).status, 400);
  assert.equal((await u.client.patch('/api/auth/profile', { name: '   ' })).status, 400);
  const cleared = await u.client.patch('/api/auth/profile', { avatar: null });
  assert.equal(cleared.data.user.avatar, null);
  assert.equal((await client(app.base).patch('/api/auth/profile', { name: 'x' })).status, 401);
});

test('demo plan: one song, no master export; paid plans have no such limits', async () => {
  const admin = await loginAdmin(app.base);
  const demo = await createUser(app.base, admin, { email: 'demo@example.com', plan: 'trial' });
  assert.equal((await demo.client.get('/api/auth/me')).data.user.limits.canDownload, false);
  assert.equal((await demo.client.post('/api/projects', { title: 'One', code: 'bpm 120' })).status, 201);
  assert.equal((await demo.client.post('/api/projects', { title: 'Two', code: 'bpm 120' })).status, 403);
  assert.equal((await demo.client.post('/api/master', {})).status, 403);
  const paid = await createUser(app.base, admin, { email: 'paid@example.com', plan: 'creator' });
  assert.equal((await paid.client.post('/api/projects', { title: 'A', code: 'bpm 120' })).status, 201);
  assert.equal((await paid.client.post('/api/projects', { title: 'B', code: 'bpm 120' })).status, 201);
});
