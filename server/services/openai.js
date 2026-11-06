import { HttpError } from '../http.js';

// Minimal OpenAI Chat Completions client. The API key never leaves the server.
// `fetchImpl` is injectable so the tests can run without the network.
export function createOpenAI({ config, fetchImpl = fetch }) {
  const { apiKey, baseUrl, model, maxOutputTokens, reasoningEffort, timeoutMs } = config.openai;

  async function chat(messages) {
    if (!apiKey) throw new HttpError(503, 'AI generation is not configured on this server');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxOutputTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new HttpError(504, 'The AI took too long to answer. Try again.');
      console.error('[openai] network error:', err.message);
      throw new HttpError(502, 'Could not reach the AI service');
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      // Log the provider's message server-side only; never forward it (it can contain account details).
      let detail = '';
      try {
        detail = (await response.json())?.error?.message ?? '';
      } catch {
        // ignore body parse errors
      }
      console.error(`[openai] HTTP ${response.status}: ${detail}`);
      if (response.status === 429) throw new HttpError(503, 'The AI service is busy or its credit is exhausted. Try again later.');
      throw new HttpError(502, 'The AI service returned an error');
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'The AI returned an empty answer');
    return {
      text,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  return { chat, model };
}

// Models sometimes wrap code in markdown fences despite instructions.
export function extractCode(text) {
  const fenced = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  return body.replace(/\r\n?/g, '\n').trim();
}
