import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const { app, seed, close } = await createApp(config);

if (seed.created) console.log('[setup] Super admin created from SUPERADMIN_EMAIL. Remove SUPERADMIN_PASSWORD from the environment now.');
else if (seed.reason) console.warn(`[setup] No super admin exists yet: ${seed.reason}`);

if (!config.openai.apiKey) console.warn('[setup] OPENAI_API_KEY is not set: AI generation is disabled.');

const server = app.listen(config.port, () => {
  console.log(`[studio] listening on :${config.port} (${config.appMode} mode, ${config.isProd ? 'production' : 'development'})`);
});

function shutdown(signal) {
  console.log(`[studio] ${signal} received, shutting down`);
  server.close(() => {
    close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
