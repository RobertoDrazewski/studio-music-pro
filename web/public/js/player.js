// Conecta el editor, el parser y el motor de audio, y dibuja el visualizador.
import { h } from './dom.js';
import { parse } from '../shared/lang/parser.js';
import { totalBars } from '../shared/lang/plan.js';
import { PulseEngine, songInstruments } from './engine.js';

export class Player {
  constructor(editor) {
    this.editor = editor;
    this.engine = new PulseEngine();
    this.mute = new Set();
    this.solo = new Set();
    this.result = parse(editor.value);
    this.listeners = new Set();
    this.position = { section: null, barInSection: 0, songBar: 0 };
    this.engine.on((e) => {
      if (e.type === 'bar') {
        this.position = e;
        this.markActiveSection(e);
      }
      if (e.type === 'state' && !e.playing) {
        this.position = { section: null, barInSection: 0, songBar: 0 };
        this.editor.setActiveLines([]);
      }
      this.emit(e);
    });
  }

  on(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(e) {
    for (const cb of this.listeners) cb(e);
  }

  get playing() {
    return this.engine.playing;
  }

  get ast() {
    return this.result.ast;
  }

  get instruments() {
    const ast = this.result.ok ? this.result.ast : this.lastGood;
    return ast ? songInstruments(ast) : [];
  }

  // Parseo el texto del editor. El código válido entra en vivo en el compás siguiente; si es inválido sigue sonando la última versión buena.
  sync(code = this.editor.value) {
    this.result = parse(code);
    this.editor.setDiagnostics({ errors: this.result.errors, warnings: this.result.warnings });
    if (this.result.ok && totalBars(this.result.ast) > 0) {
      if (this.engine.playing) this.engine.update(this.result.ast);
      this.lastGood = this.result.ast;
    }
    this.emit({ type: 'parsed', result: this.result });
    return this.result;
  }

  get playable() {
    return this.result.ok && totalBars(this.result.ast) > 0;
  }

  async play() {
    if (!this.playable) return false;
    this.applyOverrides();
    await this.engine.play(this.result.ast);
    return true;
  }

  stop() {
    this.engine.stop();
  }

  async toggle() {
    if (this.playing) this.stop();
    else return this.play();
    return true;
  }

  applyOverrides() {
    this.engine.setOverrides({ mute: [...this.mute], solo: [...this.solo] });
  }

  toggleMute(name) {
    this.mute.has(name) ? this.mute.delete(name) : this.mute.add(name);
    this.applyOverrides();
    this.emit({ type: 'mixer' });
  }

  toggleSolo(name) {
    this.solo.has(name) ? this.solo.delete(name) : this.solo.add(name);
    this.applyOverrides();
    this.emit({ type: 'mixer' });
  }

  // Resalto las líneas de la sección que está sonando ahora.
  markActiveSection(pos) {
    const ast = this.lastGood ?? this.result.ast;
    const sec = ast.sections.find((s) => s.name === pos.section) ?? ast.sections[pos.sectionIndex];
    if (!sec) return;
    const lines = [sec.line, ...sec.tracks.map((t) => t.line), ...sec.every.map((e) => e.line)].filter(Boolean);
    this.editor.setActiveLines(lines);
  }

  dispose() {
    this.engine.stop();
  }
}

// Osciloscopio en canvas dibujado desde el analizador de forma de onda del motor.
export function createScope(player, { height = 84 } = {}) {
  const canvas = h('canvas', { class: 'scope', height });
  const ctx = canvas.getContext('2d');
  let raf = 0;
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function draw() {
    const w = canvas.width;
    const hh = canvas.height;
    ctx.clearRect(0, 0, w, hh);
    const wave = player.playing ? player.engine.waveform?.getValue?.() : null;
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = css('--accent') || '#a3e635';
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    if (wave) {
      for (let i = 0; i < wave.length; i++) {
        const x = (i / (wave.length - 1)) * w;
        const y = hh / 2 + wave[i] * hh * 0.45;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    } else {
      ctx.moveTo(0, hh / 2);
      ctx.lineTo(w, hh / 2);
    }
    ctx.stroke();
    raf = requestAnimationFrame(draw);
  }

  const ro = new ResizeObserver(resize);
  queueMicrotask(() => {
    if (!canvas.isConnected) return;
    ro.observe(canvas);
    resize();
    draw();
  });
  const stop = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
  return { el: canvas, stop };
}

// Fila con Play/Stop, nombre de la sección y una tira de progreso del compás.
export function createTransport(player, { onPlayClick } = {}) {
  const playBtn = h('button', { class: 'btn primary play', type: 'button' }, '▶ Play');
  const label = h('span', { class: 'now' }, 'Ready');
  const progress = h('div', { class: 'progress' }, h('i'));
  const vol = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.85', 'aria-label': 'Volume', class: 'vol' });
  vol.addEventListener('input', () => player.engine.setVolume(Number(vol.value)));
  player.engine.setVolume(Number(vol.value));

  playBtn.addEventListener('click', async () => {
    if (onPlayClick) return onPlayClick();
    const ok = await player.toggle();
    if (!ok && !player.playable) label.textContent = 'Fix the highlighted lines to play';
  });

  const refresh = () => {
    playBtn.textContent = player.playing ? '■ Stop' : '▶ Play';
    playBtn.classList.toggle('playing', player.playing);
  };
  player.on((e) => {
    if (e.type === 'state') {
      refresh();
      if (!e.playing) {
        label.textContent = 'Stopped';
        progress.firstChild.style.width = '0%';
      }
    }
    if (e.type === 'bar') {
      const total = totalBars(player.lastGood ?? player.ast) || 1;
      label.textContent = `${e.section} · bar ${e.barInSection + 1}`;
      progress.firstChild.style.width = `${((e.songBar + 1) / total) * 100}%`;
    }
  });

  const el = h('div', { class: 'transport' }, playBtn, label, progress, h('label', { class: 'vol-wrap' }, '🔊', vol));
  return { el, refresh, label };
}
