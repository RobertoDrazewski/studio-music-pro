import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { loadConfig } from '../server/config.js';
import { createApp } from '../server/app.js';

export const ADMIN = { email: 'boss@example.com', password: 'a-very-long-admin-password' };

// Fake OpenAI server: `state.replies` is a queue of strings (or functions returning {status, body}).
export async function startFakeOpenAI() {
  const state = { audio: null, replies: [], requests: [], usage: { prompt_tokens: 1000, completion_tokens: 200 } };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      state.requests.push({ url: req.url, headers: req.headers, body: JSON.parse(raw || '{}') });
      if (req.url.endsWith('/audio/speech')) {
        res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        return res.end(state.audio ?? Buffer.alloc(400, 7));
      }
      const next = state.replies.shift();
      if (typeof next === 'function') {
        const { status, body } = next();
        res.writeHead(status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(body));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: next ?? '' } }], usage: state.usage }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { state, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise((r) => server.close(r)) };
}

export async function startApp({ openaiUrl, config = {}, env = {} } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-test-'));
  const cfg = loadConfig({
    env: {
      DATA_DIR: dataDir,
      SUPERADMIN_EMAIL: ADMIN.email,
      SUPERADMIN_PASSWORD: ADMIN.password,
      OPENAI_API_KEY: openaiUrl ? 'sk-test' : '',
      OPENAI_BASE_URL: openaiUrl || '',
      BCRYPT_COST: '4',
      ...env,
    },
    config,
  });
  const ctx = await createApp(cfg);
  const server = ctx.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    db: ctx.db,
    config: cfg,
    async stop() {
      await new Promise((r) => server.close(r));
      ctx.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

// Tiny HTTP client with a cookie jar.
export function client(base) {
  let cookie = '';
  async function request(method, url, body, headers = {}) {
    const isForm = body instanceof FormData;
    const isBin = body instanceof Uint8Array;
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body && !isForm && !isBin ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body ? (isForm || isBin ? body : JSON.stringify(body)) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const [pair] = c.split(';');
      if (pair.endsWith('=')) cookie = '';
      else cookie = pair;
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (u) => request('GET', u),
    post: (u, b) => request('POST', u, b ?? {}),
    put: (u, b) => request('PUT', u, b),
    patch: (u, b) => request('PATCH', u, b),
    del: (u) => request('DELETE', u),
    raw: request,
  };
}

export async function loginAdmin(base) {
  const c = client(base);
  const r = await c.post('/api/auth/login', ADMIN);
  if (r.status !== 200) throw new Error('admin login failed: ' + JSON.stringify(r.data));
  return c;
}

// Creates a user as admin, changes the temporary password and returns a logged-in client.
export async function createUser(base, admin, { email = 'user@example.com', name = 'User', ...rest } = {}) {
  const created = await admin.post('/api/admin/users', { email, name, ...rest });
  const c = client(base);
  await c.post('/api/auth/login', { email, password: created.data.temporaryPassword });
  const newPassword = 'my-new-password-123';
  const ch = await c.post('/api/auth/change-password', { currentPassword: created.data.temporaryPassword, newPassword });
  if (ch.status !== 200) throw new Error('change-password failed: ' + JSON.stringify(ch.data));
  return { client: c, id: created.data.user.id, password: newPassword, email };
}
