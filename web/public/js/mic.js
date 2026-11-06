// Microphone takes: recorded in the browser (any input device, including USB interfaces),
// stored in this browser's IndexedDB. Nothing is uploaded.

const DB_NAME = 'pulse-takes';
const STORE = 'takes';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

export const takes = {
  save: (name, blob) => tx('readwrite', (s) => s.put(blob, name)),
  load: (name) => tx('readonly', (s) => s.get(name)),
  remove: (name) => tx('readwrite', (s) => s.delete(name)),
};

export const micSupported = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.indexedDB);

// Lists audio inputs. Labels are only available after the user granted microphone permission.
export async function listInputs() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
}

// Starts recording from `deviceId` ('' = default). Returns { stop(): Promise<Blob>, level(): 0..1 }.
export async function startRecording(deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      // Raw signal: processing meant for calls damages music.
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    },
  });
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  ac.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const cleanup = () => { stream.getTracks().forEach((t) => t.stop()); ac.close().catch(() => {}); };
  return {
    level() {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      return Math.min(1, peak);
    },
    stop: () => new Promise((resolve) => {
      rec.onstop = () => { cleanup(); resolve(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); };
      rec.stop();
    }),
    cancel() { try { rec.stop(); } catch { /* not recording */ } cleanup(); },
  };
}
