import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z, validate, HttpError } from '../http.js';
import { extractCode } from '../services/openai.js';
import { parse, formatErrors } from '../../shared/lang/parser.js';
import { songInstruments } from '../../shared/lang/plan.js';
import { GENERATOR_SYSTEM_PROMPT, LANGUAGE_GUIDE, buildGeneratorMessages, buildRepairPrompt } from '../../shared/lang/guide.js';
import { VOICES, LIMITS, EFFECTS } from '../../shared/lang/spec.js';
import { STYLE_BY_ID, enforceStyleTempo, setBpmInCode } from '../../shared/lang/styles.js';

export function aiRoutes({ db, config, auth, quota, openai }) {
  const router = Router();

  // La referencia del lenguaje es pública dentro de la app (el editor la usa para ayuda y autocompletado).
  router.get('/guide', auth.requireAuth, (_req, res) => {
    res.json({ guide: LANGUAGE_GUIDE });
  });

  router.use(auth.requireAuth, auth.requirePasswordSet);

  router.get('/quota', (req, res) => {
    res.json({ ai: quota.aiStatus(req.user), budget: req.user.role === 'superadmin' ? quota.budgetStatus() : undefined });
  });

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `u${req.user.id}`,
    message: { error: 'Slow down: too many generations in a minute' },
  });

  const schema = z.object({
    prompt: z.string().trim().min(3, 'Describe the song you want').max(config.limits.maxPromptChars),
    // Si viene, la IA edita esta canción en vez de crear una nueva.
    code: z.string().max(config.limits.maxCodeBytes).optional(),
    // Un id de estilo de shared/lang/styles.js, o "auto" para detectarlo desde el pedido.
    style: z.string().max(40).optional(),
    // Duración deseada de una canción nueva, en minutos.
    minutes: z.number().int().min(1).max(4).optional(),
  });

  const inFlight = new Set(); // una generación a la vez por usuario

  // Chequeos previos: estilo válido, cuota, presupuesto y una sola generación por usuario. Devuelve el estado de la cuota.
  function begin(user, styleId) {
    if (styleId && styleId !== 'auto' && styleId !== 'none' && !STYLE_BY_ID[styleId]) throw new HttpError(400, 'Unknown style');
    const status = quota.aiStatus(user);
    if (status.remaining !== null && status.remaining <= 0) {
      throw new HttpError(429, 'You used all your AI generations for this month', { code: 'AI_QUOTA_EXCEEDED' });
    }
    if (quota.budgetStatus().exceeded) {
      throw new HttpError(503, 'AI generation is paused for this month', { code: 'AI_BUDGET_EXCEEDED' });
    }
    if (inFlight.has(user.id)) throw new HttpError(409, 'A generation is already running');
    inFlight.add(user.id);
    return status;
  }

  // Genera (o edita) una canción y la valida. `usage` acumula los tokens gastados aunque falle a mitad de camino.
  async function generateSong({ prompt, code, styleId, minutes }, usage, { onDelta, onRepair, signal } = {}) {
    const built = buildGeneratorMessages({ prompt, code, styleId, minutes });
    const count = (a) => { usage.promptTokens += a.promptTokens; usage.completionTokens += a.completionTokens; };
    const ask = async (messages, opts) => {
      try {
        const a = await openai.chat(messages, opts);
        count(a);
        return a;
      } catch (err) {
        if (err.partial) count(err.partial);
        throw err;
      }
    };

    let attempt = await ask(built.messages, { onDelta, signal });
    let result = extractCode(attempt.text);
    let check = parse(result);

    // Un intento automático de reparación si el modelo usó algo que no existe.
    if (!check.ok) {
      onRepair?.();
      attempt = await ask([
        { role: 'system', content: GENERATOR_SYSTEM_PROMPT },
        { role: 'user', content: buildRepairPrompt(result, formatErrors(check.errors)) },
      ], { signal });
      result = extractCode(attempt.text);
      check = parse(result);
    }

    if (!check.ok) {
      const why = formatErrors(check.errors.slice(0, 2));
      console.error(`[ai] invalid output after repair: ${why.replace(/\n/g, ' | ')}`);
      throw new HttpError(502, `The AI could not produce valid code this time (${why.split('\n')[0]}). Try again, or simplify the clicks.`, {
        code: 'AI_INVALID_OUTPUT',
      });
    }

    // Guarda determinista del tempo: a los modelos les gusta derivar a 120-130 bpm sin importar el estilo.
    let tempoAdjusted = false;
    if (built.explicitBpm && check.ast.bpm !== built.explicitBpm) {
      result = setBpmInCode(result, built.explicitBpm);
      tempoAdjusted = true;
    } else if (!code && built.style && !built.explicitBpm) {
      const fix = enforceStyleTempo(result, built.style, check.ast.bpm);
      if (fix.changed) {
        result = fix.code;
        tempoAdjusted = true;
      }
    }
    if (tempoAdjusted) check = parse(result);

    return { code: result, warnings: check.warnings, style: built.style?.id ?? null, tempoAdjusted };
  }

  // Las generaciones fallidas que igual gastaron tokens cuentan para el gasto, pero no para la cuota del usuario.
  function finish(user, usage, ok) {
    inFlight.delete(user.id);
    if (usage.promptTokens || usage.completionTokens || ok) {
      quota.recordAiUsage({ userId: user.id, model: openai.model, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, ok });
    }
  }

  const remainingAfter = (status) => (status.remaining === null ? { remaining: null } : { remaining: Math.max(0, status.remaining - 1) });

  router.post('/generate', limiter, async (req, res) => {
    const { prompt, code, style: styleId, minutes } = validate(schema, req.body);
    const user = req.user;
    const status = begin(user, styleId);
    const usage = { promptTokens: 0, completionTokens: 0 };
    let ok = false;
    try {
      const out = await generateSong({ prompt, code, styleId, minutes }, usage);
      ok = true;
      res.json({ ...out, quota: remainingAfter(status) });
    } finally {
      finish(user, usage, ok);
    }
  });

  // Igual que /generate pero en streaming (una línea JSON por evento): el navegador ve el avance real y la conexión nunca queda
  // muda (Cloudflare corta las que pasan de 100 s sin datos). Eventos: {t:'p', chars, lines}, {t:'done', ...}, {t:'error', ...}.
  router.post('/generate-stream', limiter, async (req, res) => {
    const { prompt, code, style: styleId, minutes } = validate(schema, req.body);
    const user = req.user;
    const status = begin(user, styleId);
    const usage = { promptTokens: 0, completionTokens: 0 };
    let ok = false;
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });
    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = (event) => { if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
    send({ t: 'p', chars: 0, lines: 0 });
    let last = 0;
    let ping = null;
    try {
      const out = await generateSong({ prompt, code, styleId, minutes }, usage, {
        signal: abort.signal,
        onDelta: (_piece, text) => {
          const now = Date.now();
          if (now - last < 150) return;
          last = now;
          send({ t: 'p', chars: text.length, lines: text.split('\n').length });
        },
        // Mientras se repara no llegan pedazos: mando un latido cada pocos segundos para que la conexión siga viva.
        onRepair: () => { send({ t: 'p', repairing: true }); ping = setInterval(() => send({ t: 'p', repairing: true }), 4000); },
      });
      ok = true;
      send({ t: 'done', ...out, quota: remainingAfter(status) });
    } catch (err) {
      send({ t: 'error', error: err instanceof HttpError ? err.message : 'Something went wrong. Try again.', code: err.extra?.code, status: err.status ?? 500 });
      if (!(err instanceof HttpError)) console.error('[ai] stream failed:', err);
    } finally {
      clearInterval(ping);
      finish(user, usage, ok);
      res.end();
    }
  });

  // ---- Voces de IA (texto a voz) ---------------------------------------------------
  // Los clips se cachean en disco por hash de contenido: la misma frase se paga una vez y después se sirve gratis a todos.
  const voiceLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 12,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `v${req.user.id}`,
    message: { error: 'Slow down: too many voice requests in a minute' },
  });

  const voiceSchema = z.object({
    text: z.string().trim().min(1, 'Write the words to say').max(LIMITS.maxVoiceChars),
    voice: z.enum(VOICES).default('female'),
    style: z.string().trim().max(LIMITS.maxVoiceStyleChars).optional().default(''),
    // true = solo responde si el clip ya existe (nunca gasta nada).
    onlyCached: z.boolean().optional().default(false),
  });

  const voiceInFlight = new Set();

  router.post('/voice', voiceLimiter, async (req, res) => {
    const { text, voice, style, onlyCached } = validate(voiceSchema, req.body);
    const user = req.user;
    const { ttsModel, ttsVoiceFemale, ttsVoiceMale } = config.openai;
    const hash = crypto.createHash('sha256').update(JSON.stringify([ttsModel, voice, style, text])).digest('hex');
    const file = path.join(config.voiceDir, `${hash}.mp3`);

    const send = (cached) => {
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=86400', 'X-Voice-Cached': cached ? '1' : '0' });
      res.send(fs.readFileSync(file));
    };

    if (fs.existsSync(file)) return send(true);
    if (onlyCached) throw new HttpError(404, 'Voice not generated yet', { code: 'VOICE_NOT_CACHED' });

    const status = quota.voiceStatus(user);
    if (status.remaining !== null && status.remaining <= 0) {
      throw new HttpError(429, 'You used all your AI voices for this month', { code: 'VOICE_QUOTA_EXCEEDED' });
    }
    if (quota.budgetStatus().exceeded) {
      throw new HttpError(503, 'AI generation is paused for this month', { code: 'AI_BUDGET_EXCEEDED' });
    }
    if (voiceInFlight.has(user.id)) throw new HttpError(409, 'A voice is already being generated');

    voiceInFlight.add(user.id);
    let ok = false;
    try {
      const bytes = await openai.speech({
        input: text,
        voice: voice === 'male' ? ttsVoiceMale : ttsVoiceFemale,
        instructions: style || undefined,
      });
      fs.writeFileSync(file, bytes);
      ok = true;
      send(false);
    } finally {
      voiceInFlight.delete(user.id);
      if (ok) quota.recordVoiceUsage({ userId: user.id, model: ttsModel, chars: text.length, ok: true });
    }
  });

  // ---- Mezcla rápida ----------------------------------------------------------------------
  // Para mezclar no hace falta que la IA reescriba la canción: le pido solo los ajustes de cada instrumento (unas pocas líneas
  // de JSON) y el navegador los aplica. Así tarda segundos en vez de más de un minuto y cuesta una fracción.
  const MIX_KEYS = ['vol', 'pan', 'reverb', 'delay', 'lowpass', 'highpass'];
  const MIX_SYSTEM = [
    'You are a mixing engineer for a browser music tool. Reply with ONLY one JSON object, no prose and no code fences.',
    'Keys are instrument names from the list you are given; each value is an object with any of these numeric fields:',
    'vol (0 to 1.5, 1 is unity), pan (-1 left to 1 right), reverb (0 to 1), delay (0 to 1), lowpass (Hz, 20 to 20000), highpass (Hz, 20 to 20000).',
    'Use null to remove an effect. Leave a field out to keep it as it is. Never invent instruments.',
    'Keep kick and bass centered. Do not make everything loud: leave headroom.',
  ].join(' ');

  const mixSchema = z.object({
    prompt: z.string().trim().min(3).max(config.limits.maxPromptChars),
    code: z.string().min(1).max(config.limits.maxCodeBytes),
  });

  // Dejo pasar solo los campos conocidos y llevo cada valor a su rango permitido.
  function cleanMix(raw, names) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const name of names) {
      const src = raw[name];
      if (!src || typeof src !== 'object') continue;
      const fields = {};
      for (const key of MIX_KEYS) {
        if (!(key in src)) continue;
        if (src[key] === null) { if (key !== 'vol' && key !== 'pan') fields[key] = null; continue; }
        const n = Number(src[key]);
        if (!Number.isFinite(n)) continue;
        const { min, max } = EFFECTS[key].args[0];
        fields[key] = Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
      }
      if (Object.keys(fields).length) out[name] = fields;
    }
    return out;
  }

  router.post('/mix', limiter, async (req, res) => {
    const { prompt, code } = validate(mixSchema, req.body);
    const user = req.user;
    const status = quota.aiStatus(user);
    if (status.remaining !== null && status.remaining <= 0) {
      throw new HttpError(429, 'You used all your AI generations for this month', { code: 'AI_QUOTA_EXCEEDED' });
    }
    if (quota.budgetStatus().exceeded) throw new HttpError(503, 'AI generation is paused for this month', { code: 'AI_BUDGET_EXCEEDED' });
    if (inFlight.has(user.id)) throw new HttpError(409, 'A generation is already running');

    const check = parse(code);
    if (!check.ok) throw new HttpError(400, 'Fix the errors in the song first');
    const names = songInstruments(check.ast);

    inFlight.add(user.id);
    let promptTokens = 0;
    let completionTokens = 0;
    let ok = false;
    try {
      const attempt = await openai.chat(
        [
          { role: 'system', content: MIX_SYSTEM },
          { role: 'user', content: `Instruments: ${names.join(', ')}\nBPM: ${check.ast.bpm}\nRequest: ${prompt}` },
        ],
        { maxTokens: 1500 },
      );
      promptTokens = attempt.promptTokens;
      completionTokens = attempt.completionTokens;
      const json = attempt.text.match(/\{[\s\S]*\}/)?.[0];
      let raw = null;
      try { raw = json ? JSON.parse(json) : null; } catch { raw = null; }
      const mix = cleanMix(raw, names);
      if (!Object.keys(mix).length) throw new HttpError(502, 'The AI did not return a usable mix this time. Try again.', { code: 'AI_INVALID_OUTPUT' });
      ok = true;
      res.json({ mix, quota: status.remaining === null ? { remaining: null } : { remaining: Math.max(0, status.remaining - 1) } });
    } finally {
      inFlight.delete(user.id);
      if (promptTokens || completionTokens || ok) {
        quota.recordAiUsage({ userId: user.id, model: openai.model, promptTokens, completionTokens, ok });
      }
    }
  });

  return router;
}
