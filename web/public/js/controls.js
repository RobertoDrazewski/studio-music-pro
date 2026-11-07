// Controles visuales que editan el código: barra de tempo, mezclador con faders y editor de pasos.
// Cada control llama a `edit(fn)`, que reescribe el texto de la canción, así el código siempre muestra qué cambió.
import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { DRUMS, MELODIC } from '../shared/lang/spec.js';
import { groupOf } from '../shared/lang/promptbuilder.js';
import { setGlobal, setTrackEffect, setTrackWave, setStep, resizePattern, transposeTrack, getSteps, scaleNotes } from '../shared/lang/edit.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fx = (track, name) => track?.effects.find((e) => e.name === name)?.args[0];

// Ayudante común: aplica una transformación de texto al editor (se guarda y suena como si lo hubiera tipeado).
export function makeEdit(editor) {
  return (fn) => {
    const next = fn(editor.value);
    if (next !== editor.value) editor.setValue(next);
  };
}

function currentAst(player) {
  return player.result.ok ? player.result.ast : player.lastGood ?? player.result.ast;
}

// ---------------------------------------------------------------------------------------------
// Barra de tempo
// ---------------------------------------------------------------------------------------------
export function createTempoBar({ player, edit }) {
  const num = h('input', { class: 'bpm-input', type: 'number', min: 40, max: 240, step: 1, 'aria-label': 'Tempo in beats per minute' });
  const slider = h('input', { type: 'range', min: 40, max: 240, step: 1, class: 'bpm-slider', 'aria-label': 'Tempo slider' });
  const swing = h('input', { type: 'range', min: 0, max: 0.75, step: 0.01, class: 'swing-slider', 'aria-label': 'Swing' });
  const swingVal = h('span', { class: 'mono muted' });
  const key = h('span', { class: 'chip' }, 'key –');
  const setBpm = (v) => edit((c) => setGlobal(c, 'bpm', clamp(Math.round(v), 40, 240)));

  num.addEventListener('change', () => setBpm(Number(num.value) || 120));
  slider.addEventListener('input', () => { num.value = slider.value; setBpm(Number(slider.value)); });
  swing.addEventListener('input', () => edit((c) => setGlobal(c, 'swing', Number(swing.value))));

  let taps = [];
  const tap = h('button', { class: 'btn small', type: 'button', title: 'Tap the beat to set the tempo' }, 'Tap');
  tap.addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps.at(-1) > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-8);
    if (taps.length >= 3) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  });
  const step = (d) => h('button', { class: 'btn small', type: 'button', 'aria-label': d > 0 ? 'Faster' : 'Slower', onclick: () => setBpm((Number(num.value) || 120) + d) }, d > 0 ? '+' : '−');

  const refresh = () => {
    const ast = currentAst(player);
    if (document.activeElement !== num) num.value = ast.bpm;
    slider.value = ast.bpm;
    swing.value = ast.swing ?? 0;
    swingVal.textContent = (ast.swing ?? 0).toFixed(2);
    key.textContent = ast.key ? `key ${ast.key.root} ${ast.key.scale}` : 'key –';
  };
  player.on((e) => e.type === 'parsed' && refresh());
  refresh();

  const el = h('div', { class: 'tempo-bar' },
    h('div', { class: 'tempo-group' }, h('span', { class: 'label' }, 'BPM'), step(-1), num, step(1), tap),
    slider,
    h('div', { class: 'tempo-group' }, h('span', { class: 'label' }, 'Swing'), swing, swingVal),
    key);
  return { el, refresh };
}

// ---------------------------------------------------------------------------------------------
// Mezclador: una fila por instrumento con mute/solo y un panel de faders
// ---------------------------------------------------------------------------------------------
// Pedido base de toda mezcla con IA y los objetivos que ofrecen los botones.
const MIX_BASE = 'Rebalance the mix only: adjust volume, pan, reverb, delay and filter on each instrument. Do not change notes, patterns, sections or tempo. Goal:';
const MIX_PRESETS = [
  ['Balanced', 'a clean, balanced mix where every instrument is clear.'],
  ['Punchy', 'punchy and tight: strong kick and bass, controlled mids, very little reverb.'],
  ['Wide', 'wide and spacious: spread the mids and leads across the stereo field, more reverb and delay on leads.'],
  ['Warm', 'warm and soft: tame harsh highs on mids and leads, gentle reverb.'],
  ['Voices upfront', 'make the voices clear and upfront; lower the instruments that compete with them.'],
  ['Club loud', 'loud and energetic club mix with a tight low end.'],
];

export function createMixer({ player, edit, openPattern, exportStem = () => {}, mixWithAi = () => {} }) {
  const root = h('div', { class: 'mixer' });
  const scopeSel = h('select', { class: 'select small-select', 'aria-label': 'Where edits apply' },
    h('option', { value: 'all' }, 'Edits apply to: all sections'),
    h('option', { value: 'current' }, 'Edits apply to: current section'));
  const opened = new Set();
  const refreshers = [];

  const scopeSection = () => {
    if (scopeSel.value !== 'current') return null;
    const ast = currentAst(player);
    return player.position.section ?? ast.sections[0]?.name ?? null;
  };
  const firstTrack = (inst) => {
    const ast = currentAst(player);
    const sec = scopeSection();
    const pool = (s) => (inst === 'voice' ? (s.voices ?? []).map((v) => ({ ...v, instrument: 'voice' })) : s.tracks);
    for (const s of ast.sections) {
      if (sec && s.name !== sec) continue;
      const t = pool(s).find((x) => x.instrument === inst);
      if (t) return t;
    }
    return ast.sections.flatMap((s) => pool(s)).find((x) => x.instrument === inst);
  };

  function slider({ label, min, max, step, get, set, neutral, format }) {
    const input = h('input', { type: 'range', min, max, step, 'aria-label': label });
    const val = h('span', { class: 'mono val' });
    input.addEventListener('input', () => { val.textContent = format(Number(input.value)); set(Number(input.value)); });
    const refresh = () => {
      if (document.activeElement === input) return;
      const v = get();
      input.value = v;
      val.textContent = format(v);
    };
    refreshers.push(refresh);
    void neutral;
    return h('label', { class: 'ctl' }, h('span', {}, label), input, val);
  }

  function controls(inst) {
    const sec = () => ({ section: scopeSection() });
    const isDrum = DRUMS.includes(inst);
    const fxVal = (name, dflt) => () => fx(firstTrack(inst), name) ?? dflt;
    const setFx = (name, neutral) => (v) => edit((c) => setTrackEffect(c, inst, name, v === neutral ? null : v, sec()));
    // El fader de filtro es logarítmico: 0..100 va de 80 Hz a 20 kHz (100 = sin filtro).
    const toHz = (p) => Math.round(80 * 250 ** (p / 100));
    const toPos = (hz) => clamp((Math.log(hz / 80) / Math.log(250)) * 100, 0, 100);

    const wave = h('select', { class: 'select small-select', 'aria-label': `${inst} wave` },
      ['sine', 'saw', 'square', 'tri', 'noise'].map((w) => h('option', { value: w }, `wave: ${w}`)));
    wave.addEventListener('change', () => edit((c) => setTrackWave(c, inst, wave.value, sec())));
    refreshers.push(() => { const t = firstTrack(inst); if (t && t.wave && document.activeElement !== wave) wave.value = t.wave; });

    const rows = [
      slider({ label: 'Volume', min: 0, max: 1.5, step: 0.01, get: fxVal('vol', 1), set: setFx('vol', 1), format: (v) => v.toFixed(2) }),
      slider({ label: 'Pan', min: -1, max: 1, step: 0.05, get: fxVal('pan', 0), set: setFx('pan', 0), format: (v) => (v === 0 ? 'C' : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`) }),
      slider({ label: 'Filter', min: 0, max: 100, step: 1, get: () => toPos(fx(firstTrack(inst), 'lowpass') ?? 20000),
        set: (p) => edit((c) => setTrackEffect(c, inst, 'lowpass', p >= 100 ? null : toHz(p), sec())), format: (p) => (p >= 100 ? 'off' : `${toHz(p)} Hz`) }),
      slider({ label: 'Reverb', min: 0, max: 1, step: 0.01, get: fxVal('reverb', 0), set: setFx('reverb', 0), format: (v) => v.toFixed(2) }),
      slider({ label: 'Delay', min: 0, max: 1, step: 0.01, get: fxVal('delay', 0), set: setFx('delay', 0), format: (v) => v.toFixed(2) }),
      slider({ label: 'Drive', min: 0, max: 1, step: 0.01, get: fxVal('distort', 0), set: setFx('distort', 0), format: (v) => v.toFixed(2) }),
    ];
    if (inst === 'voice') return h('div', { class: 'mix-body' }, rows.filter((_r, i) => i !== 2 && i !== 5), h('p', { class: 'muted', style: 'font-size:12px' }, 'Spoken lines: edit them in the Voices panel.'));
    const actions = h('div', { class: 'row', style: 'gap:6px' },
      h('button', { class: 'btn small', type: 'button', onclick: () => openPattern(inst) }, icon('pencil', { size: 14 }), ' Edit pattern'),
      isDrum ? null : [
        h('button', { class: 'btn small', type: 'button', title: 'One octave down', onclick: () => edit((c) => transposeTrack(c, inst, -12, sec())) }, '−8ve'),
        h('button', { class: 'btn small', type: 'button', title: 'One semitone down', onclick: () => edit((c) => transposeTrack(c, inst, -1, sec())) }, '−1'),
        h('button', { class: 'btn small', type: 'button', title: 'One semitone up', onclick: () => edit((c) => transposeTrack(c, inst, 1, sec())) }, '+1'),
        h('button', { class: 'btn small', type: 'button', title: 'One octave up', onclick: () => edit((c) => transposeTrack(c, inst, 12, sec())) }, '+8ve'),
      ]);
    return h('div', { class: 'mix-body' }, wave, rows, actions);
  }

  // Medidor de cada instrumento: lee el último golpe que dejó el motor y lo hace decaer.
  const meters = new Map();
  let rafId = 0;
  const tick = () => {
    if (!root.isConnected) { rafId = 0; return; }
    const now = window.Tone?.now?.() ?? 0;
    for (const [n, bar] of meters) {
      const a = player.engine.core?.activity.get(n);
      const lvl = a && player.playing && now >= a.t ? Math.min(1, a.vel * Math.exp(-(now - a.t) * 5)) : 0;
      bar.style.transform = `scaleY(${lvl.toFixed(2)})`;
      // Además del medidor, la fila entera recibe la intensidad del golpe para que el ícono del instrumento "se prenda" al sonar.
      (bar.__row ||= bar.closest('.mix-row'))?.style.setProperty('--hit', lvl.toFixed(2));
    }
    rafId = requestAnimationFrame(tick);
  };
  const startMeters = () => { if (!rafId) rafId = requestAnimationFrame(tick); };

  // Botones de mezcla con pedidos ya escritos: cada uno le pide a la IA un estilo de mezcla (se ve el progreso arriba).
  const quickBar = () => h('div', { class: 'mix-quick' },
    h('p', { class: 'muted', style: 'font-size:13px;margin:0' }, 'Pick a mix. The AI only changes volume, pan and effects, never your notes.'),
    h('div', { class: 'mix-presets' }, MIX_PRESETS.map(([label, goal]) => h('button', { class: 'btn', type: 'button', onclick: () => mixWithAi(`${MIX_BASE} ${goal}`) }, label))));

  function build() {
    refreshers.length = 0;
    meters.clear();
    const names = player.instruments;
    const anySolo = player.solo.size > 0;
    clear(root);
    if (!names.length) return root.append(h('p', { class: 'muted' }, 'Instruments appear here when the code is valid.'));
    root.append(quickBar(), scopeSel);
    const GROUPS = [['percussion', 'Percussion'], ['bass', 'Bass'], ['mids', 'Mids'], ['lead', 'Lead'], ['voice', 'Voices'], ['other', 'Other']];
    const ordered = [];
    for (const [gid, label] of GROUPS) {
      const members = names.filter((n) => groupOf(n) === gid);
      if (!members.length) continue;
      const allMuted = members.every((n) => player.mute.has(n));
      const allSolo = members.every((n) => player.solo.has(n));
      root.append(h('div', { class: `mix-group g-${gid}` },
        h('span', {}, label), h('span', { class: 'mix-count' }, String(members.length)), h('span', { class: 'spacer' }),
        h('button', { class: 'dl', title: `Download ${label.toLowerCase()} as WAV`, 'aria-label': `Download ${label} as WAV`, onclick: () => exportStem(members, label) }, icon('download', { size: 14 })),
        h('button', { class: `m${allMuted ? ' on' : ''}`, title: `Mute all ${label.toLowerCase()}`, 'aria-pressed': String(allMuted), onclick: () => members.forEach((n) => player.mute.has(n) === allMuted && player.toggleMute(n)) }, 'M'),
        h('button', { class: `s${allSolo ? ' on' : ''}`, title: `Solo all ${label.toLowerCase()}`, 'aria-pressed': String(allSolo), onclick: () => members.forEach((n) => player.solo.has(n) === allSolo && player.toggleSolo(n)) }, 'S')));
      ordered.push(...members);
      for (const n of members) root.append(card(n, anySolo));
    }
    return finishBuild();
  }

  function meterEl(n) {
    const bar = h('i');
    meters.set(n, bar);
    return h('span', { class: 'meter', 'aria-hidden': 'true' }, bar);
  }

  // Fader de volumen del canal: el mismo valor `vol` del código, pero a mano en la tira (solo escritorio).
  function channelFader(n) {
    const f = slider({ label: 'Volume', min: 0, max: 1.5, step: 0.01, format: (v) => v.toFixed(2),
      get: () => fx(firstTrack(n), 'vol') ?? 1,
      set: (v) => edit((c) => setTrackEffect(c, n, 'vol', v === 1 ? null : v, { section: scopeSection() })) });
    f.classList.add('mix-vol');
    return f;
  }

  function card(n, anySolo) {
    {
      const open = opened.has(n);
      const row = h('div', { class: `mix-card${open ? ' open' : ''}` },
        h('div', { class: `mix-row${player.mute.has(n) || (anySolo && !player.solo.has(n)) ? ' dim' : ''}` },
          h('img', { src: `/img/instruments/${n}.png`, alt: '' }),
          meterEl(n),
          h('button', { class: 'nm-btn', type: 'button', 'aria-expanded': String(open), onclick: () => { open ? opened.delete(n) : opened.add(n); build(); } }, icon(open ? 'chevronDown' : 'arrowRight', { size: 14 }), ` ${n}`),
          h('button', { class: 'dl', title: `Download ${n} as WAV`, 'aria-label': `Download ${n} as WAV`, onclick: () => exportStem([n], n) }, icon('download', { size: 14 })),
          h('button', { class: `m${player.mute.has(n) ? ' on' : ''}`, title: 'Mute', 'aria-pressed': String(player.mute.has(n)), onclick: () => player.toggleMute(n) }, 'M'),
          h('button', { class: `s${player.solo.has(n) ? ' on' : ''}`, title: 'Solo', 'aria-pressed': String(player.solo.has(n)), onclick: () => player.toggleSolo(n) }, 'S'),
          channelFader(n)),
        open ? controls(n) : null);
      return row;
    }
  }

  function finishBuild() {
    refreshers.forEach((r) => r());
    startMeters();
  }

  let key = '';
  const sync = () => {
    const k = player.instruments.join(',');
    if (k !== key) { key = k; build(); } else refreshers.forEach((r) => r());
  };
  player.on((e) => {
    if (e.type === 'parsed') sync();
    if (e.type === 'mixer') build();
  });
  build();
  return { el: root, rebuild: build };
}

// ---------------------------------------------------------------------------------------------
// Editor de pasos
// ---------------------------------------------------------------------------------------------
export function createPatternEditor({ player, edit, editor }) {
  const box = h('div', { class: 'pattern-editor hidden' });
  let inst = null;
  let sectionName = null;

  const ast = () => currentAst(player);

  function noteOptions(current) {
    const a = ast();
    const root = a.key?.root ?? 'c';
    const mode = a.key?.scale ?? 'minor';
    const lo = ['bass', 'sub'].includes(inst) ? 0 : 2;
    const hi = ['bass', 'sub'].includes(inst) ? 3 : 6;
    const notes = scaleNotes(root, mode, lo, hi);
    const opts = ['.', '_', ...notes];
    if (current && !opts.includes(current)) opts.push(current);
    return opts;
  }

  function render() {
    clear(box);
    if (!inst) return box.classList.add('hidden');
    box.classList.remove('hidden');
    const a = ast();
    const sections = a.sections.filter((s) => s.tracks.some((t) => t.instrument === inst));
    if (!sections.length) { inst = null; return box.classList.add('hidden'); }
    if (!sectionName || !sections.some((s) => s.name === sectionName)) sectionName = player.position.section && sections.some((s) => s.name === player.position.section) ? player.position.section : sections[0].name;
    const section = sections.find((s) => s.name === sectionName);
    const isDrum = DRUMS.includes(inst);

    const secSel = h('select', { class: 'select small-select', 'aria-label': 'Section' }, sections.map((s) => h('option', { value: s.name, selected: s.name === sectionName }, `section ${s.name}`)));
    secSel.addEventListener('change', () => { sectionName = secSel.value; render(); });

    box.append(h('div', { class: 'pe-head' },
      h('img', { src: `/img/instruments/${inst}.png`, alt: '', width: 28, height: 28 }),
      h('b', {}, `${inst} pattern`), secSel, h('span', { class: 'spacer' }),
      h('button', { class: 'icon-btn', 'aria-label': 'Close pattern editor', onclick: () => { inst = null; render(); } }, '✕')));

    for (const track of section.tracks.filter((t) => t.instrument === inst)) {
      const steps = getSteps(editor.value, track.line) ?? [];
      const grid = h('div', { class: 'pe-grid' });
      steps.forEach((tok, i) => {
        const cell = isDrum
          ? h('button', { type: 'button', class: `pe-cell drum${tok.startsWith('x') ? ' on' : ''}`, 'aria-pressed': String(tok.startsWith('x')), 'aria-label': `step ${i + 1}`,
              onclick: () => edit((c) => setStep(c, track.line, i, tok.startsWith('x') ? '.' : 'x')) }, tok.startsWith('x') ? '●' : '·')
          : h('select', { class: `pe-cell note${tok !== '.' && tok !== '_' ? ' on' : ''}`, 'aria-label': `step ${i + 1}`,
              onchange: (e) => edit((c) => setStep(c, track.line, i, e.target.value)) },
              noteOptions(tok).map((o) => h('option', { value: o, selected: o === tok }, o === '.' ? '·' : o === '_' ? '—' : o)));
        grid.append(h('div', { class: `pe-step${i % 4 === 0 ? ' beat' : ''}` }, cell, h('span', { class: 'pe-n' }, i % 4 === 0 ? String(i / 4 + 1) : '')));
      });
      const sizes = [4, 8, 16, 32].map((n) => h('button', { type: 'button', class: `btn small${steps.length === n ? ' primary' : ''}`, onclick: () => edit((c) => resizePattern(c, track.line, n)) }, String(n)));
      box.append(h('div', { class: 'pe-row' }, grid,
        h('div', { class: 'row', style: 'gap:6px;margin-top:6px' }, h('span', { class: 'muted', style: 'font-size:12px' }, 'steps'), sizes,
          h('span', { class: 'spacer' }),
          isDrum ? null : [
            h('button', { class: 'btn small', type: 'button', onclick: () => edit((c) => transposeTrack(c, inst, -12, { lineNo: track.line })) }, '−8ve'),
            h('button', { class: 'btn small', type: 'button', onclick: () => edit((c) => transposeTrack(c, inst, 12, { lineNo: track.line })) }, '+8ve')],
          h('button', { class: 'btn small', type: 'button', onclick: () => edit((c) => steps.reduce((acc, _t, i) => setStep(acc, track.line, i, '.'), c)) }, 'Clear'))));
    }
    box.append(h('p', { class: 'muted', style: 'font-size:12px;margin-top:8px' }, 'Each cell is one 16th step. The line in the code above changes as you click.'));
  }

  player.on((e) => { if (e.type === 'parsed' && inst && !box.contains(document.activeElement)) render(); });
  return { el: box, open(i) { inst = i; sectionName = null; render(); box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); } };
}
