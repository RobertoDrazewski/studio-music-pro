import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z, validate, HttpError } from '../http.js';
import { extractCode } from '../services/openai.js';
import { parse, formatErrors } from '../../shared/lang/parser.js';
import { GENERATOR_SYSTEM_PROMPT, LANGUAGE_GUIDE, buildGeneratorMessages, buildRepairPrompt } from '../../shared/lang/guide.js';
import { VOICES, LIMITS } from '../../shared/lang/spec.js';
import { STYLE_BY_ID, enforceStyleTempo, setBpmInCode } from '../../shared/lang/styles.js';

export function aiRoutes({ db, config, auth, quota, openai }) {
  const router = Router();

  // The language reference is public inside the app (the editor uses it for help and autocomplete).
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
    // When present, the AI edits this song instead of creating a new one.
    code: z.string().max(config.limits.maxCodeBytes).optional(),
    // A style id from shared/lang/styles.js, or "auto" to detect it from the prompt.
    style: z.string().max(40).optional(),
  });

  const inFlight = new Set(); // one generation at a time per user

  router.post('/generate', limiter, async (req, res) => {
    const { prompt, code, style: styleId } = validate(schema, req.body);
    if (styleId && styleId !== 'auto' && styleId !== 'none' && !STYLE_BY_ID[styleId]) throw new HttpError(400, 'Unknown style');
    const user = req.user;

    const status = quota.aiStatus(user);
    if (status.remaining !== null && status.remaining <= 0) {
      throw new HttpError(429, 'You used all your AI generations for this month', { code: 'AI_QUOTA_EXCEEDED' });
    }
    if (quota.budgetStatus().exceeded) {
      throw new HttpError(503, 'AI generation is paused for this month', { code: 'AI_BUDGET_EXCEEDED' });
    }
    if (inFlight.has(user.id)) throw new HttpError(409, 'A generation is already running');

    inFlight.add(user.id);
    let promptTokens = 0;
    let completionTokens = 0;
    let ok = false;
    try {
      const built = buildGeneratorMessages({ prompt, code, styleId });
      const messages = built.messages;

      let attempt = await openai.chat(messages);
      promptTokens += attempt.promptTokens;
      completionTokens += attempt.completionTokens;
      let result = extractCode(attempt.text);
      let check = parse(result);

      // One automatic repair attempt if the model used something that does not exist.
      if (!check.ok) {
        attempt = await openai.chat([
          { role: 'system', content: GENERATOR_SYSTEM_PROMPT },
          { role: 'user', content: buildRepairPrompt(result, formatErrors(check.errors)) },
        ]);
        promptTokens += attempt.promptTokens;
        completionTokens += attempt.completionTokens;
        result = extractCode(attempt.text);
        check = parse(result);
      }

      if (!check.ok) {
        throw new HttpError(502, 'The AI could not produce valid code this time. Try rephrasing your request.', {
          code: 'AI_INVALID_OUTPUT',
        });
      }

      // Deterministic tempo guard: models like to drift to 120-130 bpm whatever the style is.
      let tempoAdjusted = false;
      if (!code && built.explicitBpm && check.ast.bpm !== built.explicitBpm) {
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

      ok = true;
      res.json({
        code: result,
        warnings: check.warnings,
        style: built.style?.id ?? null,
        tempoAdjusted,
        quota: quota.aiStatus(user).remaining === null ? { remaining: null } : { remaining: Math.max(0, status.remaining - 1) },
      });
    } finally {
      inFlight.delete(user.id);
      // Failed generations that still consumed tokens count toward spend, but not toward the user's quota.
      if (promptTokens || completionTokens || ok) {
        quota.recordAiUsage({ userId: user.id, model: openai.model, promptTokens, completionTokens, ok });
      }
    }
  });

  // ---- AI voices (text to speech) ---------------------------------------------------
  // Clips are cached on disk by content hash: the same phrase is paid once and then served free to everyone.
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
    // true = only answer if the clip already exists (never spends anything).
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

  return router;
}
