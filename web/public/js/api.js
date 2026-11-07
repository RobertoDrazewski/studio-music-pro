// Thin wrapper over fetch for the JSON API.

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, url, body, opts = {}) {
  const isBlob = body instanceof Blob;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: isBlob
      ? { 'Content-Type': body.type || 'application/octet-stream' }
      : body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {},
    body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
    signal: opts.signal,
  });
  let data = null;
  if ((res.headers.get('content-type') || '').includes('json')) data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !opts.quiet401) window.dispatchEvent(new CustomEvent('auth:expired'));
    if (res.status === 403 && data?.code === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new CustomEvent('auth:must-change'));
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
  }
  return data;
}

export const api = {
  get: (u, o) => request('GET', u, undefined, o),
  post: (u, b = {}, o) => request('POST', u, b, o),
  put: (u, b, o) => request('PUT', u, b, o),
  patch: (u, b, o) => request('PATCH', u, b, o),
  del: (u, o) => request('DELETE', u, undefined, o),

  me: () => request('GET', '/api/auth/me', undefined, { quiet401: true }),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }, { quiet401: true }),
  logout: () => request('POST', '/api/auth/logout', {}),
  changePassword: (currentPassword, newPassword) => request('POST', '/api/auth/change-password', { currentPassword, newPassword }),

  projects: () => request('GET', '/api/projects'),
  project: (id) => request('GET', `/api/projects/${id}`),
  createProject: (title, code) => request('POST', '/api/projects', { title, code }),
  saveProject: (id, patch) => request('PUT', `/api/projects/${id}`, patch),
  deleteProject: (id) => request('DELETE', `/api/projects/${id}`),
  shareProject: (id, enabled) => request('POST', `/api/projects/${id}/share`, { enabled }),
  sharedSong: (slug) => request('GET', `/api/share/${encodeURIComponent(slug)}`, undefined, { quiet401: true }),

  mix: (prompt, code, signal) => request('POST', '/api/ai/mix', { prompt, code }, { signal }),
  // Genera una canción en streaming: llama a onProgress({chars, lines, repairing}) mientras escribe y devuelve la canción lista.
  generateStream: async (payload, { signal, onProgress } = {}) => {
    const res = await fetch('/api/ai/generate-stream', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.t === 'p') onProgress?.(ev);
        else if (ev.t === 'done') return ev;
        else if (ev.t === 'error') throw new ApiError(ev.status ?? 500, ev.error, ev.code);
      }
    }
    throw new ApiError(0, 'The connection was interrupted. Try again.');
  },
  generate: (prompt, code, style, signal) => request('POST', '/api/ai/generate', { prompt, ...(code ? { code } : {}), ...(style ? { style } : {}) }, { signal }),

  // Returns { blob, cached } or throws ApiError (404 VOICE_NOT_CACHED when onlyCached and missing).
  voice: async ({ text, voice, style, onlyCached }) => {
    const res = await fetch('/api/ai/voice', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, style: style || '', onlyCached: !!onlyCached }),
    });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* not json */ }
      if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.code);
    }
    return { blob: await res.blob(), cached: res.headers.get('X-Voice-Cached') === '1' };
  },

  updateProfile: (patch) => request('PATCH', '/api/auth/profile', patch),

  presets: () => request('GET', '/api/master/presets'),
  startUpload: () => request('POST', '/api/master/uploads', {}),
  uploadMix: (id, blob) => request('PUT', `/api/master/uploads/${id}/mix`, blob),
  uploadStem: (id, name, blob) => request('PUT', `/api/master/uploads/${id}/stems/${encodeURIComponent(name)}`, blob),
  startJob: (payload) => request('POST', '/api/master', payload),
  job: (id) => request('GET', `/api/master/jobs/${id}`),

  adminUsers: () => request('GET', '/api/admin/users'),
  adminCreateUser: (u) => request('POST', '/api/admin/users', u),
  adminUpdateUser: (id, patch) => request('PATCH', `/api/admin/users/${id}`, patch),
  adminResetPassword: (id) => request('POST', `/api/admin/users/${id}/reset-password`, {}),
  adminUsage: () => request('GET', '/api/admin/usage'),
};
