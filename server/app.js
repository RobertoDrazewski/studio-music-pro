import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { openDb } from './db.js';
import { createAuth } from './auth.js';
import { HttpError } from './http.js';
import { createQuota } from './services/quota.js';
import { createOpenAI } from './services/openai.js';
import { createMastering } from './services/mastering.js';
import { createJobs } from './services/jobs.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { projectRoutes, shareRoutes } from './routes/projects.js';
import { aiRoutes } from './routes/ai.js';
import { masterRoutes } from './routes/master.js';

// Armo toda la aplicación. Todo se crea a partir de `config`, así los tests
// pueden correr una instancia aislada (BD en memoria, OpenAI falso) sin globales.
export async function createApp(config, { fetchImpl } = {}) {
  fs.mkdirSync(config.jobsDir, { recursive: true });
  fs.mkdirSync(config.tmpDir, { recursive: true });
  fs.mkdirSync(config.voiceDir, { recursive: true });

  const db = openDb(config.dbPath);
  const auth = createAuth({ db, config });
  const quota = createQuota({ db, config });
  const openai = createOpenAI({ config, fetchImpl });
  const mastering = createMastering({ config });
  const jobs = createJobs({ db, config, mastering });

  const seed = await auth.seedSuperadmin();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy); // proxies inversos delante (proxy de Coolify, túnel de Cloudflare)

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          // blob: lo necesita el motor de audio (AudioWorklet / render offline).
          scriptSrc: ["'self'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'blob:', 'data:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'blob:', 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));

  // Defensa extra contra CSRF (las cookies ya son SameSite=Lax): los pedidos inseguros deben venir de nuestro propio origen.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // clientes que no son navegador (curl, tests)
    let host;
    try {
      host = new URL(origin).host;
    } catch {
      throw new HttpError(403, 'Invalid origin');
    }
    const allowed = new Set([req.headers.host, ...config.allowedOrigins.map((o) => new URL(o).host)]);
    if (!allowed.has(host)) throw new HttpError(403, 'Origin not allowed');
    next();
  });

  app.use('/api', auth.loadUser);
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: config.appMode, appName: config.appName }));

  app.use('/api/auth', authRoutes({ db, config, auth, quota }));
  app.use('/api/admin', adminRoutes({ db, config, auth, quota }));
  app.use('/api/projects', projectRoutes({ db, config, auth }));
  app.use('/api/share', shareRoutes({ db }));
  app.use('/api/ai', aiRoutes({ db, config, auth, quota, openai }));
  app.use('/api/master', masterRoutes({ db, config, auth, quota, jobs }));

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // ---- Front end (módulos ES simples, sin paso de build) --------------------------
  // Los archivos de código no se guardan en ningún caché (ni el del navegador ni el de Cloudflare), así un deploy se ve al instante;
  // las imágenes y fuentes se pueden cachear una hora.
  const staticOpts = {
    index: false,
    etag: true,
    setHeaders: (res, file) => {
      const code = /\.(js|css|html|webmanifest|json)$/.test(file);
      res.setHeader('Cache-Control', code || !config.isProd ? 'no-store, max-age=0' : 'public, max-age=3600');
    },
  };
  // Cada arranque del servidor (o sea, cada deploy) tiene su propia versión. El index carga el código desde /_v/<versión>/,
  // una URL que ningún caché vio antes, así el navegador y Cloudflare nunca mezclan archivos viejos con nuevos.
  const buildId = Date.now().toString(36);
  app.use((req, _res, next) => {
    if (req.url.startsWith('/_v/')) req.url = req.url.replace(/^\/_v\/[^/]+/, '');
    next();
  });
  // El navegador reutiliza el mismo parser del lenguaje que el servidor, y la librería del motor de audio.
  app.use('/shared', express.static(config.sharedDir, staticOpts));
  app.get('/vendor/tone.js', (_req, res, next) => {
    res.set('Cache-Control', config.isProd ? 'public, max-age=86400' : 'no-cache');
    res.type('application/javascript').sendFile(config.toneFile, (err) => err && next());
  });

  const indexFile = path.join(config.webDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    const cachedIndex = fs.readFileSync(indexFile, 'utf8');
    // En desarrollo releo el archivo en cada pedido, así los cambios se ven al refrescar.
    // Al index le inyecto la versión del deploy en el código y en los estilos.
    const stamp = (html) => html.replace('src="/js/main.js"', `src="/_v/${buildId}/js/main.js"`).replace('href="/css/app.css"', `href="/css/app.css?v=${buildId}"`);
    const getIndex = () => stamp(config.isProd ? cachedIndex : fs.readFileSync(indexFile, 'utf8'));
    const esc = (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const withMeta = (req, title, description, type = 'music.song') => {
      // Detrás del túnel la app ve http plano, por eso las vistas previas sociales siempre se arman con https en producción.
      const base = (config.publicUrl || `${config.isProd ? 'https' : req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const meta = [
        `<title>${esc(title)}</title>`,
        `<meta property="og:title" content="${esc(title)}">`,
        `<meta property="og:description" content="${esc(description)}">`,
        `<meta name="description" content="${esc(description)}">`,
        `<meta property="og:site_name" content="${esc(config.appName)}">`,
        `<meta property="og:locale" content="en_US">`,
        `<meta property="og:locale:alternate" content="es_LA">`,
        `<meta property="og:type" content="${type}">`,
        `<meta property="og:url" content="${esc(base)}${esc(req.originalUrl.split('?')[0])}">`,
        `<meta property="og:image" content="${esc(base)}/img/og-share.jpg">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta name="twitter:title" content="${esc(title)}">`,
        `<meta name="twitter:description" content="${esc(description)}">`,
        `<meta name="twitter:image" content="${esc(base)}/img/og-share.jpg">`,
        `<meta name="twitter:card" content="summary_large_image">`,
      ].join('\n    ');
      return getIndex().replace(/<meta name="description"[^>]*>\s*/, '').replace(/<title>[\s\S]*?<\/title>/, meta);
    };

    app.get('/s/:slug', (req, res) => {
      const row = /^[A-Za-z0-9_-]{6,40}$/.test(req.params.slug)
        ? db
            .prepare(
              'SELECT p.title, u.name AS author FROM projects p JOIN users u ON u.id = p.user_id WHERE p.share_slug = ? AND u.active = 1',
            )
            .get(req.params.slug)
        : null;
      res.set('Cache-Control', 'no-cache');
      if (!row) return res.status(404).type('html').send(withMeta(req, `Song not found · Canción no encontrada · ${config.appName}`, 'This song is not available. · Esta canción no está disponible.'));
      res.type('html').send(withMeta(req, `${row.title} · ${config.appName}`, `A song by ${row.author}, written as code and played in the browser. · Una canción de ${row.author}, escrita como código y reproducida en el navegador.`));
    });

    // El service worker nunca debe servirse desde un caché viejo, o las actualizaciones no llegarían.
    app.get('/sw.js', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.type('application/javascript').sendFile(path.join(config.webDir, 'sw.js'));
    });
    app.use(express.static(config.webDir, staticOpts));
    app.get(/^(?!\/(api|shared|vendor)\/).*/, (req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.type('html').send(withMeta(req, `${config.appName} · Make music by typing code / Haz música escribiendo código`, 'Write a few lines, hear them instantly and export your track or a Reaper project. · Escribe unas líneas, escúchalas al instante y exporta tu tema o un proyecto de Reaper.', 'website'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return {
    app,
    db,
    seed,
    close() {
      jobs.stop();
      db.close();
    },
  };
}
