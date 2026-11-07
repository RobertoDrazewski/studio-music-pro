import { HttpError } from '../http.js';

// Cliente mínimo de Chat Completions de OpenAI. La clave de la API nunca sale del servidor.
// `fetchImpl` se puede inyectar para que los tests corran sin red.
export function createOpenAI({ config, fetchImpl = fetch }) {
  const { apiKey, baseUrl, model, maxOutputTokens, reasoningEffort, timeoutMs } = config.openai;

  async function chat(messages, { maxTokens, onDelta, signal } = {}) {
    // Con onDelta pido la respuesta en streaming: el texto llega de a pedazos (sirve para mostrar el avance y para que ninguna
    // conexión quede muda mucho tiempo). En ese caso el límite de tiempo es de silencio: se renueva con cada pedazo que llega.
    const streaming = typeof onDelta === 'function';
    if (!apiKey) throw new HttpError(503, 'AI generation is not configured on this server');

    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), timeoutMs);
    // Si quien pidió la canción se va (cancela o cierra la pestaña), corto el pedido a OpenAI para no seguir gastando.
    signal?.addEventListener('abort', () => controller.abort(), { once: true });
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), timeoutMs); };
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: maxTokens ?? maxOutputTokens,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          ...(streaming ? { stream: true, stream_options: { include_usage: true } } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new HttpError(504, 'The AI took too long to answer. Try again.');
      console.error('[openai] network error:', err.message);
      throw new HttpError(502, 'Could not reach the AI service');
    }

    if (!response.ok) {
      clearTimeout(timer);
      // El mensaje del proveedor lo registro solo en el servidor; nunca lo reenvío (puede traer datos de la cuenta).
      let detail = '';
      try {
        detail = (await response.json())?.error?.message ?? '';
      } catch {
        // ignoro errores al leer el cuerpo
      }
      console.error(`[openai] HTTP ${response.status}: ${detail}`);
      if (response.status === 429) throw new HttpError(503, 'The AI service is busy or its credit is exhausted. Try again later.');
      throw new HttpError(502, 'The AI service returned an error');
    }

    if (streaming) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let usage = null;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bump();
          buffer += decoder.decode(value, { stream: true });
          let nl;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') continue;
            let chunk;
            try { chunk = JSON.parse(payload); } catch { continue; }
            const piece = chunk.choices?.[0]?.delta?.content;
            if (piece) { text += piece; onDelta(piece, text); }
            if (chunk.usage) usage = chunk.usage;
          }
        }
      } catch (err) {
        const failure = err.name === 'AbortError' ? new HttpError(504, 'The AI took too long to answer. Try again.') : new HttpError(502, 'The AI service returned an error');
        // Lo que ya se generó igual se cobra: lo estimo para que el gasto del mes no quede por debajo.
        failure.partial = { promptTokens: Math.ceil(JSON.stringify(messages).length / 4), completionTokens: Math.ceil(text.length / 4) };
        throw failure;
      } finally {
        clearTimeout(timer);
      }
      if (!text.trim()) throw new HttpError(502, 'The AI returned an empty answer');
      // Si el proveedor no manda el uso, lo estimo (≈4 caracteres por token) para que el gasto no quede en cero.
      return { text, promptTokens: usage?.prompt_tokens ?? 0, completionTokens: usage?.completion_tokens ?? Math.ceil(text.length / 4) };
    }

    // El reloj sigue corriendo mientras leo el cuerpo: si se traba la lectura, también corto.
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw err.name === 'AbortError' ? new HttpError(504, 'The AI took too long to answer. Try again.') : new HttpError(502, 'The AI service returned an error');
    } finally {
      clearTimeout(timer);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(502, 'The AI returned an empty answer');
    return {
      text,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  // Texto a voz. Devuelvo un Buffer MP3.
  async function speech({ input, voice, instructions }) {
    if (!apiKey) throw new HttpError(503, 'AI voices are not configured on this server');
    const { ttsModel } = config.openai;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: ttsModel,
          voice,
          input,
          response_format: 'mp3',
          ...(instructions ? { instructions } : {}),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new HttpError(504, 'The voice service took too long. Try again.');
      console.error('[openai] network error (speech):', err.message);
      throw new HttpError(502, 'Could not reach the voice service');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let detail = '';
      try {
        detail = (await response.json())?.error?.message ?? '';
      } catch {
        // ignoro errores al leer el cuerpo
      }
      console.error(`[openai] speech HTTP ${response.status}: ${detail}`);
      if (response.status === 429) throw new HttpError(503, 'The voice service is busy or its credit is exhausted. Try again later.');
      throw new HttpError(502, 'The voice service returned an error');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100) throw new HttpError(502, 'The voice service returned an empty file');
    return bytes;
  }

  return { chat, speech, model };
}

// A veces los modelos envuelven el código en bloques markdown aunque se les pida que no.
export function extractCode(text) {
  const fenced = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  return body.replace(/\r\n?/g, '\n').trim();
}
