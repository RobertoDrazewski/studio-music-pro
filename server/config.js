import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function num(value, fallback) {
  const n = Number.parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
}

function list(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Builds the runtime configuration. `overrides` is used by the tests.
export function loadConfig(overrides = {}) {
  const env = { ...process.env, ...(overrides.env ?? {}) };
  const isProd = env.NODE_ENV === 'production';

  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    if (isProd) {
      throw new Error('JWT_SECRET is required in production (at least 32 characters). Generate one with: openssl rand -hex 32');
    }
    // Development only: an ephemeral secret invalidates sessions on every restart.
    jwtSecret = crypto.randomBytes(32).toString('hex');
  }

  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));

  const config = {
    root: ROOT,
    isProd,
    port: int(env.PORT, 3000),
    // Number of reverse proxies in front of the app (Coolify's proxy + Cloudflare tunnel = 2).
    trustProxy: int(env.TRUST_PROXY, 1),
    publicUrl: env.PUBLIC_URL || '',
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    webDir: path.resolve(env.WEB_DIR || path.join(ROOT, 'web', 'public')),
    sharedDir: path.join(ROOT, 'shared'),
    toneFile: path.join(ROOT, 'node_modules', 'tone', 'build', 'Tone.js'),
    appName: env.APP_NAME || 'Pulse Studio',
    dataDir,
    dbPath: path.join(dataDir, 'studio.db'),
    jobsDir: path.join(dataDir, 'jobs'),
    tmpDir: path.join(dataDir, 'tmp'),

    // 'trial' = invited users only, no billing. 'subscription' is reserved for later.
    appMode: env.APP_MODE === 'subscription' ? 'subscription' : 'trial',

    auth: {
      jwtSecret,
      cookieName: 'sid',
      sessionDays: int(env.SESSION_DAYS, 14),
      bcryptCost: int(env.BCRYPT_COST, 12),
      superadminEmail: (env.SUPERADMIN_EMAIL || '').trim().toLowerCase(),
      superadminPassword: env.SUPERADMIN_PASSWORD || '',
      minPasswordLength: 10,
    },

    limits: {
      defaultAiMonthlyQuota: int(env.DEFAULT_AI_MONTHLY_QUOTA, 20),
      defaultMasterDailyQuota: int(env.DEFAULT_MASTER_DAILY_QUOTA, 5),
      maxProjectsPerUser: int(env.MAX_PROJECTS_PER_USER, 100),
      maxCodeBytes: int(env.MAX_CODE_BYTES, 50_000),
      maxPromptChars: int(env.MAX_PROMPT_CHARS, 600),
    },

    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      // Verify the model name against your OpenAI account before going live.
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      // Reasoning models count their hidden thinking inside this limit, so keep it generous.
      maxOutputTokens: int(env.OPENAI_MAX_OUTPUT_TOKENS, 4000),
      // Optional: low | medium | high. Only for reasoning models; leave empty for the rest.
      reasoningEffort: env.OPENAI_REASONING_EFFORT || '',
      timeoutMs: int(env.OPENAI_TIMEOUT_MS, 60_000),
      // USD per 1M tokens, used only to estimate spend. Update when prices change.
      priceInPerM: num(env.OPENAI_PRICE_IN_PER_M, 0.15),
      priceOutPerM: num(env.OPENAI_PRICE_OUT_PER_M, 0.6),
      // Hard stop for the whole app, on top of the limit set in the OpenAI dashboard.
      monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 5),
    },

    master: {
      ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
      ffprobe: env.FFPROBE_PATH || 'ffprobe',
      concurrency: Math.max(1, int(env.MASTER_CONCURRENCY, 1)),
      // Cloudflare rejects request bodies over 100 MB, so each file is uploaded in its own request.
      maxUploadMb: int(env.MAX_UPLOAD_MB, 95),
      maxAudioSeconds: int(env.MAX_AUDIO_SECONDS, 480),
      maxStems: 16,
      jobTtlHours: int(env.JOB_TTL_HOURS, 24),
      jobTimeoutMs: int(env.JOB_TIMEOUT_MS, 5 * 60_000),
    },
  };

  return deepMerge(config, overrides.config ?? {});
}

function deepMerge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' ? deepMerge(base[k], v) : v;
  }
  return out;
}
