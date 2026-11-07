// Voces de IA: líneas habladas escritas en el código como   voice "palabras" female|male [bar N] [style "..."]
// El audio se genera en el servidor (con caché por contenido) solo cuando el usuario toca Generate.

import { api } from './api.js';
import { h, clear, toast, debounce } from './dom.js';
import { icon } from './icons.js';
import { voiceBuffers } from './engine.js';
import { voiceKey } from '../shared/lang/plan.js';
import { insertLineInSection, removeLine } from '../shared/lang/edit.js';
import { LIMITS } from '../shared/lang/spec.js';
import { takes, micSupported, listInputs, startRecording } from './mic.js';

const Tone = window.Tone;

const clean = (s) => s.replace(/["\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

export function createVoicesPanel({ player, edit, editor, session, onPending = () => {} }) {
  const status = new Map(); // voiceKey -> 'ready' | 'missing' | 'loading' | 'error'
  const errors = new Map();
  const peeked = new Set();
  const root = h('div', { class: 'voices' });
  let previewSource = null;

  const ast = () => (player.result.ok ? player.result.ast : player.lastGood ?? player.result.ast);

  async function decode(blob) {
    const raw = Tone.getContext().rawContext;
    return raw.decodeAudioData(await blob.arrayBuffer());
  }

  async function peek(v) {
    const key = voiceKey(v);
    if (voiceBuffers.has(key) || peeked.has(key)) return;
    peeked.add(key);
    try {
      if (v.voice === 'mic') {
        const blob = await takes.load(v.text);
        if (!blob) throw Object.assign(new Error('Take not found in this browser'), { code: 'VOICE_NOT_CACHED' });
        voiceBuffers.set(key, await decode(blob));
        status.set(key, 'ready');
        render();
        return;
      }
      const { blob } = await api.voice({ text: v.text, voice: v.voice, style: v.style, onlyCached: true });
      voiceBuffers.set(key, await decode(blob));
      status.set(key, 'ready');
    } catch (e) {
      status.set(key, e.code === 'VOICE_NOT_CACHED' ? 'missing' : 'error');
      if (e.code !== 'VOICE_NOT_CACHED') errors.set(key, e.message);
    }
    render();
  }

  async function generate(v) {
    const key = voiceKey(v);
    status.set(key, 'loading');
    errors.delete(key);
    render();
    try {
      const { blob, cached } = await api.voice({ text: v.text, voice: v.voice, style: v.style });
      voiceBuffers.set(key, await decode(blob));
      status.set(key, 'ready');
      const q = session.quota?.voice;
      if (!cached && q && q.remaining !== null) session.quota = { ...session.quota, voice: { ...q, used: q.used + 1, remaining: Math.max(0, q.remaining - 1) } };
      return true;
    } catch (e) {
      status.set(key, 'error');
      errors.set(key, e.message);
      toast(e.message, 'error', 6000);
      return false;
    } finally {
      render();
    }
  }

  async function preview(v) {
    const buffer = voiceBuffers.get(voiceKey(v));
    if (!buffer) return;
    await Tone.start();
    try { previewSource?.stop(); } catch { /* already stopped */ }
    const raw = Tone.getContext().rawContext;
    const src = raw.createBufferSource();
    src.buffer = buffer;
    src.connect(raw.destination);
    src.start();
    previewSource = src;
  }

  const quotaText = () => {
    const q = session.quota?.voice;
    if (!q) return '';
    return q.limit === null ? 'AI voices: unlimited' : `New AI voices this month: ${q.remaining} of ${q.limit} left`;
  };

  function allLines() {
    const rows = [];
    for (const s of ast().sections) for (const v of s.voices ?? []) rows.push({ ...v, section: s.name, sectionBars: s.bars });
    return rows;
  }

  // ---- grabar tu propia voz ----
  const micBox = h('div', { class: 'voice-form mic-box' });
  const mic = { devices: [], deviceId: '', rec: null, timer: null, started: 0, over: true, name: 'vocal 1' };
  const meter = h('div', { class: 'mic-meter' }, h('i'));
  const micStatus = h('span', { class: 'muted', style: 'font-size:12px' });

  async function loadDevices() {
    try {
      mic.devices = await listInputs();
    } catch { mic.devices = []; }
  }

  function stopTimers() {
    clearInterval(mic.timer);
    mic.timer = null;
    meter.firstChild.style.width = '0%';
  }

  async function startRec() {
    try {
      mic.rec = await startRecording(mic.deviceId);
    } catch (e) {
      toast(e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow it in the browser address bar.' : `Could not open the microphone: ${e.message}`, 'error', 7000);
      return;
    }
    await loadDevices(); // los nombres aparecen recién cuando dan el permiso
    mic.started = Date.now();
    if (mic.over && player.playable) {
      player.stop?.();
      await player.play();
    }
    mic.timer = setInterval(() => {
      meter.firstChild.style.width = `${Math.round((mic.rec?.level() ?? 0) * 100)}%`;
      micStatus.textContent = `Recording… ${((Date.now() - mic.started) / 1000).toFixed(1)} s`;
    }, 80);
    renderMic();
  }

  async function stopRec() {
    const rec = mic.rec;
    mic.rec = null;
    stopTimers();
    const seconds = (Date.now() - mic.started) / 1000;
    const blob = await rec.stop();
    if (mic.over && player.playing) player.stop?.();
    if (seconds < 0.3) { micStatus.textContent = 'Too short, nothing saved.'; return renderMic(); }
    const name = clean(mic.name) || `take ${Date.now() % 1000}`;
    try {
      await takes.save(name, blob);
      voiceBuffers.set(voiceKey({ voice: 'mic', style: '', text: name }), await decode(blob));
      peeked.add(voiceKey({ voice: 'mic', style: '', text: name }));
      const exists = allLines().some((l) => l.voice === 'mic' && l.text === name);
      if (!exists) {
        const first = ast().sections[0]?.name ?? null;
        edit((c) => insertLineInSection(c, first, `mic "${name}" bar 1`));
      }
      micStatus.textContent = `Saved “${name}” (${seconds.toFixed(1)} s).`;
      status.set(voiceKey({ voice: 'mic', style: '', text: name }), 'ready');
    } catch (e) {
      toast(`Could not save the take: ${e.message}`, 'error');
    }
    mic.name = `vocal ${Number((mic.name.match(/(\d+)$/) ?? [0, 0])[1]) + 1}`;
    render();
  }

  function renderMic() {
    clear(micBox);
    if (!micSupported()) return micBox.append(h('p', { class: 'muted' }, 'Recording is not supported in this browser.'));
    const recording = !!mic.rec;
    const dev = h('select', { class: 'select small-select', 'aria-label': 'Audio input', disabled: recording, style: 'max-width:100%' },
      h('option', { value: '' }, 'Default input'), mic.devices.map((d) => h('option', { value: d.id, selected: d.id === mic.deviceId }, d.label)));
    dev.addEventListener('change', () => { mic.deviceId = dev.value; });
    dev.addEventListener('focus', async () => { if (!mic.devices.length) { await loadDevices(); renderMic(); } });
    const nameIn = h('input', { class: 'input', value: mic.name, maxlength: 60, disabled: recording, 'aria-label': 'Take name' });
    nameIn.addEventListener('input', () => { mic.name = nameIn.value; });
    const over = h('input', { type: 'checkbox', checked: mic.over, disabled: recording, 'aria-label': 'Play the song while recording' });
    over.addEventListener('change', () => { mic.over = over.checked; });
    micBox.append(
      h('div', { class: 'pb-title' }, icon('mic', { size: 14 }), ' Record your voice'),
      dev, nameIn,
      h('label', { class: 'muted', style: 'font-size:12px;display:block;margin:4px 0' }, over, ' Play the song while I record (use headphones)'),
      h('div', { class: 'row', style: 'gap:8px' },
        recording
          ? h('button', { class: 'btn small danger', type: 'button', onclick: stopRec }, icon('stop', { size: 13 }), ' Stop')
          : h('button', { class: 'btn small primary', type: 'button', onclick: startRec }, icon('disc', { size: 13 }), ' Record'),
        meter, micStatus),
      h('p', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, 'Takes stay in this browser (nothing is uploaded). They start on bar 1 of the first section; change "bar N" in the code to move one. On another device the take will be missing.'));
  }

  // ---- formulario para agregar ----
  const text = h('textarea', { class: 'textarea', rows: 2, maxlength: LIMITS.maxVoiceChars, placeholder: 'Words to say, e.g. "One love, one heart"' });
  const gender = h('select', { class: 'select small-select', 'aria-label': 'Voice' }, [h('option', { value: 'female' }, 'female'), h('option', { value: 'male' }, 'male')]);
  const styleIn = h('input', { class: 'input', maxlength: LIMITS.maxVoiceStyleChars, placeholder: 'tone, e.g. slow, deep and warm (optional)' });
  const barIn = h('input', { class: 'input', type: 'number', min: 1, value: 1, style: 'width:64px', 'aria-label': 'Bar' });
  const secSel = h('select', { class: 'select small-select', 'aria-label': 'Section' });
  const addBtn = h('button', { class: 'btn small primary', type: 'button' }, '+ Add voice line');

  addBtn.addEventListener('click', () => {
    const words = clean(text.value);
    if (!words) return toast('Write the words first', 'error');
    const n = allLines().length;
    if (n >= LIMITS.maxVoices) return toast(`At most ${LIMITS.maxVoices} voice lines per song`, 'error');
    const tone = clean(styleIn.value);
    const line = `voice "${words}" ${gender.value} bar ${Math.max(1, Number(barIn.value) || 1)}${tone ? ` style "${tone}"` : ''}`;
    edit((c) => insertLineInSection(c, secSel.value || null, line));
    text.value = '';
    toast('Line added to the code. Press Generate to create the audio.', 'ok');
  });

  const missingList = () => allLines().filter((v) => status.get(voiceKey(v)) !== 'ready');

  function render() {
    const lines = allLines();
    const sections = ast().sections.map((s) => s.name);
    const keep = secSel.value;
    secSel.replaceChildren(...(sections.length ? sections : ['']).map((n) => h('option', { value: n }, n ? `section ${n}` : 'end of song')));
    if (sections.includes(keep)) secSel.value = keep;

    clear(root);
    root.append(h('p', { class: 'muted', style: 'font-size:12px' },
      'Spoken lines, not singing. Audio is made by an AI voice service only when you press Generate (it costs a little; the same phrase is never paid twice).'));
    if (!lines.length) root.append(h('p', { class: 'muted' }, 'No voice lines yet.'));

    for (const v of lines) {
      const key = voiceKey(v);
      const st = status.get(key) ?? 'missing';
      const isMic = v.voice === 'mic';
      const name = h('div', { class: 'vc-text' }, isMic ? [icon('mic', { size: 13 }), ` ${v.text}`] : `“${v.text}”`);
      const meta = h('div', { class: 'muted', style: 'font-size:12px' },
        `${isMic ? 'your recording' : v.voice} · section ${v.section} · bar ${v.bar}${v.style ? ` · ${v.style}` : ''} · `,
        h('span', { class: `chip ${st === 'ready' ? 'ok' : st === 'error' ? 'off' : ''}`, title: errors.get(key) ?? '' },
          isMic ? (st === 'ready' ? 'take ready' : 'take missing on this browser')
            : st === 'ready' ? 'AI voice ready' : st === 'loading' ? 'generating…' : st === 'error' ? 'error' : 'not generated'));
      root.append(h('div', { class: 'voice-card' }, name, meta,
        h('div', { class: 'row', style: 'gap:6px;margin-top:6px' },
          st === 'ready' || (isMic && st !== 'loading')
            ? h('button', { class: 'btn small', type: 'button', disabled: st !== 'ready', onclick: () => preview(v) }, '▶ Listen')
            : h('button', { class: 'btn small primary', type: 'button', disabled: st === 'loading', onclick: () => generate(v) }, st === 'error' ? 'Retry' : 'Generate'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'icon-btn', type: 'button', title: 'Remove this line', 'aria-label': 'Remove voice line', onclick: () => edit((c) => removeLine(c, v.line)) }, '🗑'))));
    }

    const pending = missingList().filter((x) => x.voice !== 'mic').filter((v) => status.get(voiceKey(v)) !== 'loading');
    const distinct = new Map(pending.map((v) => [voiceKey(v), v]));
    // Aviso a la pantalla cuántas voces faltan por generar para mostrar la insignia en la pestaña.
    onPending(distinct.size);
    if (distinct.size > 1) {
      root.append(h('button', { class: 'btn small', type: 'button', onclick: async () => {
        if (!confirm(`Generate ${distinct.size} AI voices? Each one uses 1 of your monthly voices.`)) return;
        for (const v of distinct.values()) if (!(await generate(v))) break;
      } }, `Generate all missing (${distinct.size})`));
    }

    renderMic();
    root.append(micBox);
    root.append(h('div', { class: 'voice-form' }, text,
      h('div', { class: 'row', style: 'gap:6px;margin:6px 0' }, gender, secSel, h('span', { class: 'muted', style: 'font-size:12px' }, 'bar'), barIn),
      styleIn, h('div', { style: 'margin-top:6px' }, addBtn)),
      h('div', { class: 'muted', style: 'font-size:12px;margin-top:6px' }, quotaText()));
  }

  const onParsed = debounce(() => {
    for (const s of ast().sections) for (const v of s.voices ?? []) peek(v);
    render();
  }, 250);
  player.on((e) => { if (e.type === 'parsed') onParsed(); });
  onParsed();
  render();
  return { el: root, refresh: render };
}
