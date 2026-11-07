// Cuotas y contabilidad del gasto. Todo se calcula desde la base de datos, así
// los reinicios nunca ponen un contador en cero.

function monthStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function dayStartIso(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function createQuota({ db, config }) {
  const aiCountStmt = db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND ok = 1 AND kind = 'chat' AND created_at >= ?");
  const voiceCountStmt = db.prepare("SELECT COUNT(*) AS n FROM ai_usage WHERE user_id = ? AND ok = 1 AND kind = 'voice' AND created_at >= ?");
  const insertVoice = db.prepare(
    "INSERT INTO ai_usage (user_id, model, prompt_tokens, completion_tokens, cost_usd, ok, kind) VALUES (?, ?, ?, 0, ?, ?, 'voice')",
  );
  const spendStmt = db.prepare('SELECT COALESCE(SUM(cost_usd), 0) AS usd FROM ai_usage WHERE created_at >= ?');
  const masterCountStmt = db.prepare(
    "SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND kind = 'master' AND status != 'failed' AND created_at >= ?",
  );
  const insertUsage = db.prepare(
    `INSERT INTO ai_usage (user_id, model, prompt_tokens, completion_tokens, cost_usd, ok)
     VALUES (@userId, @model, @promptTokens, @completionTokens, @costUsd, @ok)`,
  );

  function aiStatus(user) {
    const used = aiCountStmt.get(user.id, monthStartIso()).n;
    const unlimited = user.role === 'superadmin';
    return {
      used,
      limit: unlimited ? null : user.ai_monthly_quota,
      remaining: unlimited ? null : Math.max(0, user.ai_monthly_quota - used),
    };
  }

  function voiceStatus(user) {
    const used = voiceCountStmt.get(user.id, monthStartIso()).n;
    const unlimited = user.role === 'superadmin';
    return {
      used,
      limit: unlimited ? null : user.voice_monthly_quota,
      remaining: unlimited ? null : Math.max(0, user.voice_monthly_quota - used),
    };
  }

  function recordVoiceUsage({ userId, model, chars, ok }) {
    const cost = (chars / 1000) * config.openai.ttsPricePer1kChars;
    insertVoice.run(userId, model, chars, ok ? cost : 0, ok ? 1 : 0);
  }

  function budgetStatus() {
    const spent = spendStmt.get(monthStartIso()).usd;
    const cap = config.openai.monthlyBudgetUsd;
    return { spentUsd: Number(spent.toFixed(4)), capUsd: cap, exceeded: cap > 0 && spent >= cap };
  }

  function masterStatus(user) {
    const used = masterCountStmt.get(user.id, dayStartIso()).n;
    const unlimited = user.role === 'superadmin';
    return {
      used,
      limit: unlimited ? null : user.master_daily_quota,
      remaining: unlimited ? null : Math.max(0, user.master_daily_quota - used),
    };
  }

  function estimateCost(promptTokens, completionTokens) {
    const { priceInPerM, priceOutPerM } = config.openai;
    return (promptTokens * priceInPerM + completionTokens * priceOutPerM) / 1_000_000;
  }

  function recordAiUsage({ userId, model, promptTokens, completionTokens, ok }) {
    insertUsage.run({
      userId,
      model,
      promptTokens,
      completionTokens,
      costUsd: estimateCost(promptTokens, completionTokens),
      ok: ok ? 1 : 0,
    });
  }

  return { aiStatus, voiceStatus, recordVoiceUsage, budgetStatus, masterStatus, estimateCost, recordAiUsage, monthStartIso };
}
