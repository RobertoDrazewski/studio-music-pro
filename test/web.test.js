import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, loginAdmin } from './helpers.js';

let app;
before(async () => { app = await startApp({ env: { PUBLIC_URL: 'https://studio.example.com' } }); });
after(async () => { await app.stop(); });

const get = (p, headers) => fetch(app.base + p, { headers });

test('web: index, assets, shared language files and Tone.js are served', async () => {
  const index = await get('/');
  assert.equal(index.status, 200);
  assert.match(await index.text(), /<div id="app">/);
  assert.equal((await get('/css/app.css')).status, 200);
  assert.equal((await get('/js/main.js')).status, 200);
  assert.equal((await get('/js/engine.js')).status, 200);
  assert.equal((await get('/shared/lang/parser.js')).status, 200);
  const tone = await get('/vendor/tone.js');
  assert.equal(tone.status, 200);
  assert.match(tone.headers.get('content-type'), /javascript/);
});

test('web: client-side routes fall back to index.html but unknown API paths do not', async () => {
  for (const p of ['/studio', '/studio/abc', '/admin', '/login']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get('content-type'), /html/);
  }
  const api = await get('/api/does-not-exist');
  assert.notEqual(api.headers.get('content-type')?.includes('html'), true);
  assert.equal(api.status, 404);
});

test('web: CSP forbids inline scripts', async () => {
  const csp = (await get('/')).headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' blob:/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
});

test('web: share page has escaped social preview tags', async () => {
  const admin = await loginAdmin(app.base);
  const created = await admin.post('/api/projects', { title: 'Evil "><script>x</script> song', code: 'bpm 120' });
  const id = created.data.project.id;
  const shared = await admin.post(`/api/projects/${id}/share`, { enabled: true });
  const slug = shared.data.project.shareSlug;
  const html = await (await get(`/s/${slug}`)).text();
  assert.doesNotMatch(html, /<script>x<\/script>/);
  assert.match(html, /og:title/);
  assert.match(html, /og:image" content="https:\/\/studio\.example\.com\//);
  const missing = await get('/s/not-a-real-slug');
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /<div id="app">/); // la SPA dibuja su propia página de "no encontrado"
});

test('web: the index loads code from a versioned path and that path serves the same files', async () => {
  const html = await (await get('/')).text();
  const m = html.match(/src="(\/_v\/[a-z0-9]+\/js\/main\.js)"/);
  assert.ok(m, 'main.js should be loaded from /_v/<version>/');
  assert.match(html, /href="\/css\/app\.css\?v=[a-z0-9]+"/);
  for (const url of [m[1], m[1].replace('main.js', 'views/studio.js'), m[1].replace('js/main.js', 'shared/lang/parser.js')]) {
    const r = await get(url);
    assert.equal(r.status, 200, url);
    assert.match(r.headers.get('content-type'), /javascript/, url);
  }
});
