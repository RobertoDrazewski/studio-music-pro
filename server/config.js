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

// Armo la configuración de ejecución. `overrides` lo usan los tests.
export function loadConfig(overrides = {}) {
  const env = { ...process.env, ...(overrides.env ?? {}) };
  const isProd = env.NODE_ENV === 'production';

  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    if (isProd) {
      throw new Error('JWT_SECRET is required in production (at least 32 characters). Generate one with: openssl rand -hex 32');
    }
    // Solo en desarrollo: un secreto efímero invalida las sesiones en cada reinicio.
    jwtSecret = crypto.randomBytes(32).toString('hex');
  }

  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));

  const config = {
    root: ROOT,
    isProd,
    port: int(env.PORT, 3000),
    // Cantidad de proxies inversos delante de la app (proxy de Coolify + túnel de Cloudflare = 2).
    trustProxy: int(env.TRUST_PROXY, 1),
    publicUrl: env.PUBLIC_URL || '',
    allowedOrigins: list(env.ALLOWED_ORIGINS),
    webDir: path.resolve(env.WEB_DIR || path.join(ROOT, 'web', 'public')),
    sharedDir: path.join(ROOT, 'shared'),
    toneFile: path.join(ROOT, 'node_modules', 'tone', 'build', 'Tone.js'),
    appName: env.APP_NAME || 'Pulse Studio',
    dataDir,
    dbPath: path.join(dataDir, 'studio.db'),
    voiceDir: path.join(dataDir, 'voices'),
    jobsDir: path.join(dataDir, 'jobs'),
    tmpDir: path.join(dataDir, 'tmp'),

    // 'trial' = solo usuarios invitados, sin cobro. 'subscription' queda reservado para después.
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
      defaultVoiceMonthlyQuota: int(env.DEFAULT_VOICE_MONTHLY_QUOTA, 10),
      maxProjectsPerUser: int(env.MAX_PROJECTS_PER_USER, 100),
      maxCodeBytes: int(env.MAX_CODE_BYTES, 50_000),
      maxPromptChars: int(env.MAX_PROMPT_CHARS, 1500),
    },

    openai: {
      apiKey: env.OPENAI_API_KEY || '',
      baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      // Verificá el nombre del modelo en tu cuenta de OpenAI antes de salir en vivo.
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      // Los modelos de razonamiento cuentan su pensamiento oculto dentro de este límite, así que lo dejo generoso.
      maxOutputTokens: int(env.OPENAI_MAX_OUTPUT_TOKENS, 6000),
      // Opcional: low | medium | high. Solo para modelos de razonamiento; vacío para el resto.
      reasoningEffort: env.OPENAI_REASONING_EFFORT || '',
      timeoutMs: int(env.OPENAI_TIMEOUT_MS, 60_000),
      // USD por 1M de tokens, solo para estimar el gasto. Actualizar cuando cambien los precios.
      priceInPerM: num(env.OPENAI_PRICE_IN_PER_M, 0.15),
      priceOutPerM: num(env.OPENAI_PRICE_OUT_PER_M, 0.6),
      // Corte duro para toda la app, además del límite del panel de OpenAI.
      monthlyBudgetUsd: num(env.AI_MONTHLY_BUDGET_USD, 5),
      // Texto a voz para el comando "voice". Los clips generados se cachean en disco por contenido,
      // así la misma frase se paga una sola vez.
      ttsModel: env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      ttsVoiceFemale: env.OPENAI_TTS_VOICE_FEMALE || 'coral',
      ttsVoiceMale: env.OPENAI_TTS_VOICE_MALE || 'onyx',
      // USD por 1000 caracteres, solo para estimar el gasto (aproximado: ver openai.com/api/pricing).
      ttsPricePer1kChars: num(env.OPENAI_TTS_PRICE_PER_1K_CHARS, 0.02),
    },

    master: {
      ffmpeg: env.FFMPEG_PATH || 'ffmpeg',
      ffprobe: env.FFPROBE_PATH || 'ffprobe',
      concurrency: Math.max(1, int(env.MASTER_CONCURRENCY, 1)),
      // Cloudflare rechaza cuerpos de más de 100 MB, por eso cada archivo se sube en su propio pedido.
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
