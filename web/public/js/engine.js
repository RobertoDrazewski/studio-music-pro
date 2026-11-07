// Motor de audio de Pulse: convierte la canción ya parseada (AST) en sonido con Tone.js.
//
// Un solo planificador lo mueve todo: una vez por compás le pregunto a plan.js qué pasa
// en ese compás y programo las notas. Como releo la canción en cada compás, lo que edito
// mientras suena entra en el compás siguiente sin cortar nada.
// El mismo código corre en vivo (tiempo real) y fuera de línea (render a archivo).
//
// Todos los sonidos se sintetizan acá, no uso samples; así lo que el usuario exporta es suyo.
//

import {
  barSeconds,
  totalBars,
  locate,
  planTrack,
  activeEvery,
  audibleSet,
  trackSignature,
  songInstruments,
  voiceKey,
} from '/shared/lang/plan.js';
import { DRUMS } from '/shared/lang/spec.js';

const Tone = window.Tone;

const WAVE_TO_TONE = { sine: 'sine', saw: 'sawtooth', square: 'square', tri: 'triangle' };
// Margen de volumen: varios sintes fuertes juntos pueden pasarse de la escala, así que el master arranca más bajo.
const MASTER_BASE = 0.7;

// ---------------------------------------------------------------------------
// Voces. Cada voz tiene `out` (un nodo de Tone) y trigger(tiempo, evento, duración en segundos).
// ---------------------------------------------------------------------------

function noteName(n) {
  return n[0].toUpperCase() + n.slice(1);
}

// Clips de voz de la IA ya decodificados, por voiceKey(). Los llena voices.js y los leen todos los SongCore (vivo y offline).
export const voiceBuffers = new Map();

function makeVoice(instrument, wave) {
  const tonal = WAVE_TO_TONE[wave];

  // Voces habladas ---------------------------------------------------------
  if (instrument === 'voice') {
    const out = new Tone.Gain(1);
    // Tomo ahora el contexto nativo: en un render offline este es el offline.
    const raw = Tone.getContext().rawContext;
    const live = new Set();
    return {
      out,
      trigger(time, ev) {
        if (!ev.buffer) return;
        const src = raw.createBufferSource();
        src.buffer = ev.buffer;
        Tone.connect(src, out);
        src.start(time);
        live.add(src);
        src.onended = () => live.delete(src);
      },
      release() {
        for (const s of live) {
          try {
            s.stop();
          } catch {
            // ya estaba detenido
          }
        }
        live.clear();
      },
      dispose: () => out.dispose(),
    };
  }

  // Batería ---------------------------------------------------------------
  if (instrument === 'kick') {
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 7,
      oscillator: { type: tonal ?? 'sine' },
      envelope: { attack: 0.001, decay: 0.38, sustain: 0, release: 0.1 },
    });
    return {
      out: synth,
      trigger(time, ev, _dur, vel) {
        synth.triggerAttackRelease('C1', 0.4, time, vel);
      },
      dispose: () => synth.dispose(),
    };
  }

  if (instrument === 'snare' || instrument === 'clap') {
    const isClap = instrument === 'clap';
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: isClap ? 0.16 : 0.17, sustain: 0, release: 0.05 },
    });
    const filter = new Tone.Filter(isClap ? 1500 : 1800, 'bandpass').set({ Q: isClap ? 1.2 : 0.7 });
    noise.connect(filter);
    const body = isClap ? null : new Tone.MembraneSynth({ pitchDecay: 0.02, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 } });
    const out = new Tone.Gain(1);
    filter.connect(out);
    if (body) body.connect(out);
    return {
      out,
      trigger(time, ev, _dur, vel) {
        if (isClap) {
          // Tres ráfagas rápidas hacen el ataque del aplauso.
          noise.triggerAttackRelease(0.02, time, vel * 0.7);
          noise.triggerAttackRelease(0.02, time + 0.011, vel * 0.8);
          noise.triggerAttackRelease(0.14, time + 0.024, vel);
        } else {
          noise.triggerAttackRelease(0.15, time, vel);
          body.triggerAttackRelease('G2', 0.1, time, vel * 0.7);
        }
      },
      dispose() {
        noise.dispose();
        filter.dispose();
        body?.dispose();
        out.dispose();
      },
    };
  }

  if (instrument === 'hat' || instrument === 'openhat') {
    const open = instrument === 'openhat';
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: open ? 0.34 : 0.045, sustain: 0, release: open ? 0.1 : 0.01 },
    });
    const hp = new Tone.Filter(7500, 'highpass');
    noise.connect(hp);
    return {
      out: hp,
      trigger(time, ev, _dur, vel) {
        noise.triggerAttackRelease(open ? 0.3 : 0.04, time, vel * 0.55);
      },
      dispose() {
        noise.dispose();
        hp.dispose();
      },
    };
  }

  if (instrument === 'perc') {
    const synth = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 3,
      oscillator: { type: tonal ?? 'triangle' },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.05 },
    });
    return {
      out: synth,
      trigger(time, ev, _dur, vel) {
        synth.triggerAttackRelease('E3', 0.12, time, vel * 0.8);
      },
      dispose: () => synth.dispose(),
    };
  }

  // Melódicos ---------------------------------------------------------------
  if (wave === 'noise') {
    // Textura sin tono: una ráfaga de ruido filtrado por nota.
    const noise = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.3 },
    });
    return {
      out: noise,
      trigger(time, ev, dur, vel) {
        noise.triggerAttackRelease(dur, time, vel * 0.5);
      },
      dispose: () => noise.dispose(),
    };
  }

  const settings = {
    bass: { env: { attack: 0.005, decay: 0.2, sustain: 0.55, release: 0.12 }, lp: 1600, gain: 0.9, poly: 1, detune: [0] },
    sub: { env: { attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.2 }, lp: 400, gain: 1, poly: 1, detune: [0] },
    // Mids y leads arrancan con un pasabajos suave para que saw y square no suenen ásperos; la canción puede abrirlo.
    pad: { env: { attack: 0.35, decay: 0.4, sustain: 0.7, release: 1.2 }, lp: 3200, gain: 0.3, poly: 12, detune: [-7, 7] },
    strings: { env: { attack: 0.7, decay: 0.5, sustain: 0.8, release: 1.6 }, lp: 2600, gain: 0.26, poly: 12, detune: [-10, 0, 10] },
    organ: { env: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.07 }, lp: 2400, gain: 0.34, poly: 8, detune: [0] },
    keys: { env: { attack: 0.004, decay: 0.7, sustain: 0.18, release: 0.45 }, lp: 4200, gain: 0.5, poly: 8, detune: [0] },
    stab: { env: { attack: 0.003, decay: 0.16, sustain: 0, release: 0.12 }, lp: 3200, gain: 0.5, poly: 8, detune: [-6, 6] },
    lead: { env: { attack: 0.01, decay: 0.12, sustain: 0.5, release: 0.25 }, lp: 5200, gain: 0.5, poly: 4, detune: [0] },
    synth: { env: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.35 }, lp: 4200, gain: 0.55, poly: 4, detune: [-8, 8] },
    bell: { env: { attack: 0.002, decay: 0.9, sustain: 0, release: 0.6 }, lp: 7000, gain: 0.6, poly: 6, detune: [0], ratios: [1, 2.756, 5.404], amps: [1, 0.35, 0.12] },
    pluck: { env: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.15 }, lp: 5000, gain: 0.65, poly: 4, detune: [0] },
    arp: { env: { attack: 0.002, decay: 0.12, sustain: 0.05, release: 0.08 }, lp: 5000, gain: 0.55, poly: 4, detune: [0] },
  }[instrument];
  const ratios = settings.ratios ?? [1];
  const amps = settings.amps ?? [1];

  // Las notas son osciladores nativos con envolvente de ganancia. Es mucho más barato que el PolySynth
  // de Tone, y eso importa cuando renderizo una canción entera offline.
  const raw = Tone.getContext().rawContext; // lo capturo ahora: mirá la nota en SongCore
  const type = tonal ?? 'sawtooth';
  const sum = new Tone.Gain(1);
  const tone = new Tone.Filter(settings.lp, 'lowpass');
  const level = new Tone.Gain(settings.gain);
  sum.chain(tone, level);
  const live = new Set();

  function note(name, time, dur, vel) {
    const freq = Tone.Frequency(name).toFrequency();
    const { attack, decay, sustain, release } = settings.env;
    const env = raw.createGain();
    const peak = vel / Math.sqrt(settings.detune.length * ratios.length);
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peak, time + attack);
    env.gain.setTargetAtTime(peak * sustain, time + attack, Math.max(0.005, decay / 3));
    const end = time + Math.max(dur, attack);
    env.gain.setTargetAtTime(0, end, Math.max(0.01, release / 3));
    const stopAt = end + release * 1.6 + 0.05;
    const oscs = settings.detune.flatMap((cents) => ratios.map((ratio, k) => {
      const osc = raw.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * ratio, time);
      osc.detune.setValueAtTime(cents, time);
      if (amps[k] !== 1) {
        const a = raw.createGain();
        a.gain.value = amps[k];
        osc.connect(a);
        a.connect(env);
      } else osc.connect(env);
      osc.start(time);
      osc.stop(stopAt);
      return osc;
    }));
    Tone.connect(env, sum);
    const handle = { env, oscs };
    live.add(handle);
    oscs[0].onended = () => {
      live.delete(handle);
      try {
        env.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  return {
    out: level,
    trigger(time, ev, dur, vel) {
      const notes = ev.notes.map(noteName);
      if (!notes.length) return;
      if (instrument === 'arp' && notes.length > 1) {
        // Reparto las notas del acorde a lo largo del paso: eso es lo que hace un arpegiador.
        const slot = dur / notes.length;
        notes.forEach((n, i) => note(n, time + i * slot, Math.max(0.03, slot * 0.9), vel));
      } else if (settings.poly === 1) {
        note(notes[0], time, dur, vel); // los instrumentos monofónicos tocan la primera nota del acorde
      } else {
        notes.forEach((n) => note(n, time, dur, vel));
      }
    },
    release() {
      for (const h of live) {
        try {
          h.env.gain.cancelScheduledValues(0);
          h.env.gain.setTargetAtTime(0, raw.currentTime, 0.05);
        } catch {
          /* ignore */
        }
      }
    },
    dispose() {
      sum.dispose();
      tone.dispose();
      level.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Efectos. Cada uno devuelve { node, set(args, tiempo) } y set() cambia la cantidad
// en un momento dado (lo uso para "every N bars").
// ---------------------------------------------------------------------------

function makeCrusher(bits) {
  const levels = Math.pow(2, Math.max(1, bits) - 1);
  const shaper = new Tone.WaveShaper((x) => Math.round(x * levels) / levels, 2048);
  return shaper;
}

const NEUTRAL = { lowpass: 20000, highpass: 20, bandpass: 1000, delay: 0, reverb: 0, distort: 0, chorus: 0, phaser: 0 };

// Reverb = convolución con un impulso de ruido sintético que decae. Corre nativo en el
// navegador (rápido, también offline) y no necesita samples. El ruido tiene semilla, así que
// la reverb suena igual en la vista previa y en cada render.
function makeReverb(wet) {
  const ctx = Tone.getContext();
  const rate = ctx.sampleRate;
  const seconds = 1.5;
  const length = Math.floor(rate * seconds);
  // Un solo canal para que la convolución sea barata (importa mucho en renders offline en compus lentas).
  const impulse = ctx.createBuffer(1, length, rate);
  for (let c = 0; c < 1; c++) {
    const data = impulse.getChannelData(c);
    let seed = 0x9e3779b9 ^ (c * 0x85ebca6b);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const noise = (seed >>> 0) / 4294967296 * 2 - 1;
      const decay = Math.pow(1 - i / length, 3.2);
      lp += (noise - lp) * 0.55; // amortiguación suave de agudos
      data[i] = lp * decay;
    }
  }
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const dry = new Tone.Gain(1);
  const wetGain = new Tone.Gain(0);
  const convolver = new Tone.Convolver(impulse);
  convolver.normalize = true;
  input.connect(dry);
  dry.connect(output);
  input.chain(convolver, wetGain, output);
  const set = (x, t) => {
    const when = t ?? Tone.now();
    wetGain.gain.setValueAtTime(x * 0.9, when);
    dry.gain.setValueAtTime(1 - x * 0.45, when);
  };
  set(wet, 0);
  return {
    input,
    output,
    set,
    dispose() {
      [input, output, dry, wetGain, convolver].forEach((n) => n.dispose());
    },
  };
}

function makeEffect(name, value) {
  const v = value ?? NEUTRAL[name];
  switch (name) {
    case 'lowpass':
    case 'highpass':
    case 'bandpass': {
      const node = new Tone.Filter(v, name);
      return { node, apply: (x, t) => node.frequency.setValueAtTime(x, t), neutral: NEUTRAL[name] };
    }
    case 'delay': {
      const node = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.38, wet: v });
      return { node, apply: (x, t) => node.wet.setValueAtTime(x, t), neutral: 0 };
    }
    case 'reverb': {
      const rv = makeReverb(v);
      return { node: rv.input, out: rv.output, apply: (x, t) => rv.set(x, t), neutral: 0, dispose: () => rv.dispose() };
    }
    case 'distort': {
      const node = new Tone.Distortion({ distortion: v, wet: 1 });
      return { node, apply: (x) => (node.distortion = x), neutral: 0 };
    }
    case 'bitcrush':
      return { node: makeCrusher(v ?? 8), apply: null, neutral: null };
    case 'chorus': {
      const node = new Tone.Chorus({ frequency: 1.6, delayTime: 3.5, depth: 0.7, wet: v || 0.5 }).start();
      return { node, apply: (x, t) => node.wet.setValueAtTime(x, t), neutral: 0 };
    }
    case 'phaser': {
      const node = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 350, wet: v || 0.5 });
      return { node, apply: (x, t) => node.wet.setValueAtTime(x, t), neutral: 0 };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Cadena de una pista: voz -> efectos -> pan -> volumen -> sidechain -> bus
// ---------------------------------------------------------------------------

class Chain {
  constructor(track, section, bus) {
    this.instrument = track.instrument;
    this.voice = makeVoice(track.instrument, track.wave);
    this.nodes = [];
    this.effects = new Map(); // nombre -> { node, apply, neutral, base }
    this.lastUsedBar = 0;

    const base = new Map();
    for (const fx of track.effects) if (fx.name !== 'pan' && fx.name !== 'vol' && fx.name !== 'sidechain') base.set(fx.name, fx.args[0]);
    const latent = new Set();
    for (const rule of section.every ?? []) {
      if (rule.instrument === track.instrument) for (const e of rule.effects) latent.add(e.name);
    }

    // El orden importa: primero el tono, después el espacio.
    const order = ['highpass', 'bandpass', 'lowpass', 'bitcrush', 'distort', 'chorus', 'phaser', 'delay', 'reverb'];
    let prev = this.voice.out;
    for (const name of order) {
      if (!base.has(name) && !latent.has(name)) continue;
      const fx = makeEffect(name, base.get(name));
      if (!fx) continue;
      fx.base = base.has(name) ? base.get(name) : fx.neutral;
      prev.connect(fx.node);
      prev = fx.out ?? fx.node;
      this.effects.set(name, fx);
      this.nodes.push(fx.node);
    }

    this.pan = new Tone.Panner(0);
    this.volume = new Tone.Gain(1);
    this.duck = new Tone.Gain(1);
    prev.chain(this.pan, this.volume, this.duck, bus);
    this.baseVol = track.effects.find((e) => e.name === 'vol')?.args[0] ?? 1;
    this.basePan = track.effects.find((e) => e.name === 'pan')?.args[0] ?? 0;
    this.sidechain = track.effects.find((e) => e.name === 'sidechain')?.args[0] ?? null;
    this.pan.pan.value = this.basePan;
    this.volume.gain.value = this.baseVol;
  }

  // Fijo los parámetros de este compás: la base, reemplazada por las reglas "every" activas.
  applyBar(time, overrides) {
    let vol = this.baseVol;
    let pan = this.basePan;
    const current = new Map([...this.effects].map(([k, fx]) => [k, fx.base]));
    for (const fx of overrides ?? []) {
      if (fx.name === 'vol') vol = fx.args[0];
      else if (fx.name === 'pan') pan = fx.args[0];
      else if (current.has(fx.name)) current.set(fx.name, fx.args[0] ?? current.get(fx.name));
    }
    this.volume.gain.setValueAtTime(vol, time);
    this.pan.pan.setValueAtTime(pan, time);
    for (const [name, fx] of this.effects) if (fx.apply) fx.apply(current.get(name), time);
  }

  dispose() {
    this.voice.dispose();
    for (const fx of this.effects.values()) (fx.dispose ? fx.dispose() : fx.node.dispose());
    this.pan.dispose();
    this.volume.dispose();
    this.duck.dispose();
  }
}

// ---------------------------------------------------------------------------
// Núcleo de la canción: lo comparten la reproducción en vivo y el render offline.
// ---------------------------------------------------------------------------

// Una línea de voz se comporta como una pista sin pasos (así comparte el código de efectos).
function voiceTrack(v) {
  return { instrument: 'voice', wave: null, steps: [], effects: v.effects ?? [] };
}

class SongCore {
  constructor({ live }) {
    this.live = live;
    // Lo capturo ahora: en un render offline el "contexto actual" de Tone es solo el offline mientras corre
    // el callback, por eso todos los nodos (y el transporte) se crean de entrada, nunca perezosamente.
    this.transport = Tone.getTransport();
    this.ast = null;
    this.pendingAst = null;
    this.overrides = { mute: new Set(), solo: new Set() };
    this.only = null; // Set de instrumentos a renderizar (stems), o null para todo

    this.chains = new Map(); // firma -> Chain
    this.activity = new Map(); // instrumento -> último golpe {t, vel}
    this.barCount = 0;

    // Bus master: efectos del usuario -> limitador -> salida
    this.bus = new Tone.Gain(1);
    this.masterFx = [];
    this.userVolume = 1;
    this.masterVol = 1;
    this.masterGain = new Tone.Gain(MASTER_BASE);
    this.limiter = new Tone.Limiter(-1);
    this.bus.connect(this.masterGain);
    this.masterTail = this.masterGain;
    this.masterSignature = '';
    this.limiter.toDestination();
    this.masterTail.connect(this.limiter);
    if (live) {
      this.analyser = new Tone.Analyser('fft', 128);
      this.analyser.smoothing = 0.8;
      this.limiter.connect(this.analyser);
      this.wave = new Tone.Analyser('waveform', 512);
      this.limiter.connect(this.wave);
    }
  }

  updateMasterGain(rampSeconds = 0) {
    const value = MASTER_BASE * this.masterVol * this.userVolume;
    if (rampSeconds) this.masterGain.gain.rampTo(value, rampSeconds);
    else this.masterGain.gain.value = value;
  }

  setMasterEffects(effects) {
    const sig = JSON.stringify(effects);
    if (sig === this.masterSignature) return;
    this.masterSignature = sig;
    // Reconstruyo: bus -> efectos... -> ganancia master
    this.bus.disconnect();
    for (const fx of this.masterFx) (fx.dispose ? fx.dispose() : fx.node.dispose());
    this.masterFx = [];
    let prev = this.bus;
    let masterVol = 1;
    for (const fx of effects) {
      if (fx.name === 'vol') {
        masterVol = fx.args[0];
        continue;
      }
      const built = makeEffect(fx.name, fx.args[0]);
      if (!built) continue;
      prev.connect(built.node);
      prev = built.out ?? built.node;
      this.masterFx.push(built);
    }
    prev.connect(this.masterGain);
    this.masterVol = masterVol;
    this.updateMasterGain();
  }

  chainFor(track, section, songBar) {
    const sig = trackSignature(track, section);
    let chain = this.chains.get(sig);
    if (!chain) {
      chain = new Chain(track, section, this.bus);
      this.chains.set(sig, chain);
    }
    chain.lastUsedBar = songBar;
    return chain;
  }

  // Se llama una vez por compás en el tiempo de audio `time`.
  scheduleBar(time) {
    if (this.pendingAst) {
      this.ast = this.pendingAst;
      this.pendingAst = null;
    }
    const ast = this.ast;
    const barIndex = this.barCount++;
    if (!ast) return null;

    const where = locate(ast, barIndex);
    if (!where) return { ended: true };
    const { section, sectionIndex, barInSection } = where;

    this.setMasterEffects(ast.master);
    const transport = this.transport;
    if (Math.abs(transport.bpm.value - ast.bpm) > 0.001) transport.bpm.setValueAtTime(ast.bpm, time);

    const bar = barSeconds(ast.bpm);
    const audible = audibleSet(ast, this.overrides);
    const every = activeEvery(section, barInSection);

    // Primera pasada: los golpes de cada pista, para conocer las fuentes de sidechain antes de programar los destinos.
    const planned = section.tracks.map((track, idx) => ({
      track,
      idx,
      events: planTrack(track, idx, where.songBar),
    }));
    const bySource = new Map();
    for (const p of planned) bySource.set(p.track.instrument, p.events);

    const hits = [];
    for (const { track, idx, events } of planned) {
      if (this.only && !this.only.has(track.instrument)) continue; // render de stem: las demás pistas se saltan por completo
      const chain = this.chainFor(track, section, barIndex);
      chain.applyBar(time, every.get(track.instrument));
      const isAudible = audible(track.instrument);

      if (chain.sidechain && isAudible) {
        const source = bySource.get(chain.sidechain) ?? [];
        const beat = 60 / ast.bpm;
        for (const ev of source) {
          const t = this.timeOf(time, ev, bar, ast.swing);
          chain.duck.gain.cancelScheduledValues(t);
          chain.duck.gain.setValueAtTime(0.18, t);
          chain.duck.gain.linearRampToValueAtTime(1, t + beat * 0.85);
        }
      }
      if (!isAudible) continue;

      const vel = DRUMS.includes(track.instrument) ? 0.9 : 0.8;
      for (const ev of events) {
        const t0 = this.timeOf(time, ev, bar, ast.swing);
        const slot = (ev.length * bar) / ev.repeat;
        for (let r = 0; r < ev.repeat; r++) {
          const accent = r === 0 ? 1 : 0.75;
          const dur = Math.max(0.02, slot * (DRUMS.includes(track.instrument) ? 0.9 : 0.95));
          hits.push({ chain, inst: track.instrument, t: t0 + r * slot, ev, dur, vel: vel * accent });
        }
      }
    }
    // Dos líneas del mismo instrumento comparten voz: las disparo en orden de tiempo y salto los duplicados exactos,
    // porque los sintes no pueden arrancar dos veces en el mismo instante.
    hits.sort((a, b) => a.t - b.t);
    const lastHit = new Map();
    for (const k of hits) {
      const prev = lastHit.get(k.chain);
      if (prev !== undefined && k.t <= prev + 0.0005) continue;
      lastHit.set(k.chain, k.t);
      k.chain.voice.trigger(k.t, k.ev, k.dur, k.vel);
      // Guardo el último golpe de cada instrumento para que el mezclador dibuje su medidor.
      this.activity.set(k.inst, { t: k.t, vel: k.vel });
    }

    // Los clips hablados arrancan al comienzo de su compás.
    if (!this.only || this.only.has('voice')) {
      for (const v of section.voices ?? []) {
        if (v.bar !== barInSection + 1 || !audible('voice')) continue;
        const buffer = voiceBuffers.get(voiceKey(v));
        if (!buffer) continue; // todavía no se generó: queda en silencio
        const chain = this.chainFor(voiceTrack(v), section, barIndex);
        chain.applyBar(time, every.get('voice'));
        chain.voice.trigger(time, { buffer });
      }
    }

    // Libero las cadenas que llevan un rato sin usarse (para entonces sus colas de reverb ya terminaron).
    // Solo lo hace la reproducción en vivo: el render offline crea todo de entrada.
    for (const [sig, chain] of this.live ? this.chains : []) {
      if (barIndex - chain.lastUsedBar > 6) {
        chain.dispose();
        this.chains.delete(sig);
      }
    }
    return { sectionIndex, barInSection, section: section.name, songBar: where.songBar, time };
  }

  // Construyo todas las cadenas que necesita la canción (antes de un render offline).
  prepare(ast) {
    for (const section of ast.sections) {
      for (const track of section.tracks) {
        if (!this.only || this.only.has(track.instrument)) this.chainFor(track, section, 0);
      }
      if (!this.only || this.only.has('voice')) {
        for (const v of section.voices ?? []) this.chainFor(voiceTrack(v), section, 0);
      }
    }
  }

  timeOf(barStart, ev, bar, swing) {
    let t = barStart + ev.position * bar;
    if (swing && ev.swingable) t += (swing * 0.5 * bar) / ev.steps;
    return t;
  }

  releaseAll() {
    for (const c of this.chains.values()) c.voice.release?.();
  }

  dispose() {
    for (const c of this.chains.values()) c.dispose();
    this.chains.clear();
    for (const fx of this.masterFx) (fx.dispose ? fx.dispose() : fx.node.dispose());
    this.bus.dispose();
    this.masterGain.dispose();
    this.limiter.dispose();
    this.analyser?.dispose();
    this.wave?.dispose();
  }
}

// ---------------------------------------------------------------------------
// Motor en vivo (el que usa el editor)
// ---------------------------------------------------------------------------

export class PulseEngine {
  constructor() {
    this.core = null;
    this.playing = false;
    this.listeners = new Set();
    this.eventId = null;
    this.volume = 1;
  }

  on(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(info) {
    for (const cb of this.listeners) cb(info);
  }

  get analyser() {
    return this.core?.analyser ?? null;
  }

  get waveform() {
    return this.core?.wave ?? null;
  }

  // Hay que llamarlo desde un clic o una tecla (si no, el navegador bloquea el audio).
  async play(ast) {
    await Tone.start();
    if (this.playing) {
      this.update(ast);
      return;
    }
    this.core?.dispose();
    this.core = new SongCore({ live: true });
    this.core.userVolume = this.volume;
    this.core.updateMasterGain();
    if (this.pendingOverrides) this.setOverrides(this.pendingOverrides);
    this.core.ast = ast;
    this.core.barCount = 0;
    const transport = Tone.getTransport();
    transport.cancel(0);
    transport.stop();
    transport.bpm.value = ast.bpm;
    this.eventId = transport.scheduleRepeat((time) => {
      const info = this.core.scheduleBar(time);
      if (!info) return;
      if (info.ended) {
        Tone.getDraw().schedule(() => this.stop(), time);
        return;
      }
      Tone.getDraw().schedule(() => this.emit({ type: 'bar', ...info }), time);
    }, '1m', 0);
    transport.start('+0.08');
    this.playing = true;
    this.emit({ type: 'state', playing: true });
  }

  // Aplico una canción nueva y válida al comienzo del compás siguiente.
  update(ast) {
    if (this.core) this.core.pendingAst = ast;
  }

  setOverrides({ mute, solo }) {
    if (this.core) this.core.overrides = { mute: new Set(mute ?? []), solo: new Set(solo ?? []) };
    this.pendingOverrides = { mute, solo };
  }

  setVolume(v) {
    this.volume = v;
    if (this.core) {
      this.core.userVolume = v;
      this.core.updateMasterGain(0.05);
    }
  }

  stop() {
    if (!this.playing) return;
    const transport = Tone.getTransport();
    this.core?.releaseAll();
    transport.stop();
    transport.cancel(0);
    this.eventId = null;
    this.playing = false;
    // Libero los nodos cuando las colas de release ya se apagaron.
    const old = this.core;
    this.core = null;
    setTimeout(() => old?.dispose(), 2500);
    this.emit({ type: 'state', playing: false });
  }
}

// ---------------------------------------------------------------------------
// Render offline (para descargas y mastering)
// ---------------------------------------------------------------------------

export const TAIL_SECONDS = 2.5;

export function songDuration(ast) {
  return totalBars(ast) * barSeconds(ast.bpm) + TAIL_SECONDS;
}

// Renderizo el arreglo completo una vez. `only` renderiza un solo instrumento (un stem).
export async function renderSong(ast, { only = null, sampleRate = 44100 } = {}) {
  const bars = totalBars(ast);
  if (!bars) throw new Error('The song has no instruments yet');
  const single = { ...ast, loop: false };
  const buffer = await Tone.Offline(async () => {
    const core = new SongCore({ live: false });
    core.ast = single;
    core.only = only ? new Set([].concat(only)) : null;
    core.setMasterEffects(single.master);
    core.prepare(single);
    const transport = core.transport;
    transport.bpm.value = single.bpm;
    transport.scheduleRepeat((time) => core.scheduleBar(time), '1m', 0, `${bars}m`);
    transport.start(0);
  }, songDuration(ast), 2, sampleRate);
  return buffer.get();
}

const PEAK_CEILING = 0.89; // aprox. -1 dBFS

// Renderizo la mezcla y, opcionalmente, un archivo por instrumento. Todo se escala con el mismo factor
// para que nada sature y los stems sigan sumando igual que la mezcla.
export async function renderProject(ast, { stems = true, groups = 'instrument', groupOf = () => 'other', onProgress = () => {} } = {}) {
  const audible = audibleSet(ast);
  const insts = stems ? songInstruments(ast).filter(audible) : [];
  // Qué renderizo como archivos separados: cada instrumento, cada grupo (percusión, bajos...) o ambos.
  const items = [];
  if (groups === 'instrument' || groups === 'both') for (const n of insts) items.push({ name: n, only: [n], kind: 'instrument', group: groupOf(n) });
  if (groups === 'group' || groups === 'both') {
    const byGroup = new Map();
    for (const n of insts) byGroup.set(groupOf(n), [...(byGroup.get(groupOf(n)) ?? []), n]);
    for (const [g, members] of byGroup) items.push({ name: g, only: members, kind: 'group', group: g });
  }
  const total = 1 + items.length;
  onProgress({ step: 0, total, label: 'mix' });
  const mix = await renderSong(ast);
  const peak = bufferStats(mix).peak;
  if (peak < 0.0005) throw new Error('The song renders as silence. Check that it has audible instruments.');
  const scale = peak > PEAK_CEILING ? PEAK_CEILING / peak : 1;
  const rendered = [];
  for (let i = 0; i < items.length; i++) {
    onProgress({ step: i + 1, total, label: items[i].name });
    rendered.push({ ...items[i], buffer: await renderSong(ast, { only: items[i].only }) });
  }
  if (scale !== 1) {
    for (const b of [mix, ...rendered.map((r) => r.buffer)]) {
      for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++) d[i] *= scale;
      }
    }
  }
  onProgress({ step: total, total, label: 'done' });
  return { mix, stems: rendered, scale };
}

export { songInstruments };

// ---------------------------------------------------------------------------
// Codificación WAV
// ---------------------------------------------------------------------------

export function encodeWav(audioBuffer, bits = 24) {
  const channels = audioBuffer.numberOfChannels;
  const frames = audioBuffer.length;
  const bytes = bits / 8;
  const dataSize = frames * channels * bytes;
  const out = new DataView(new ArrayBuffer(44 + dataSize));
  const write = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  write(0, 'RIFF');
  out.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, channels, true);
  out.setUint32(24, audioBuffer.sampleRate, true);
  out.setUint32(28, audioBuffer.sampleRate * channels * bytes, true);
  out.setUint16(32, channels * bytes, true);
  out.setUint16(34, bits, true);
  write(36, 'data');
  out.setUint32(40, dataSize, true);

  const data = [];
  for (let c = 0; c < channels; c++) data.push(audioBuffer.getChannelData(c));
  let o = 44;
  const max = Math.pow(2, bits - 1) - 1;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      const v = Math.round(s * max);
      if (bits === 16) out.setInt16(o, v, true);
      else {
        out.setUint8(o, v & 0xff);
        out.setUint8(o + 1, (v >> 8) & 0xff);
        out.setUint8(o + 2, (v >> 16) & 0xff);
      }
      o += bytes;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

// Pico y RMS de un buffer renderizado (sirve para detectar renders en silencio).
export function bufferStats(audioBuffer) {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < d.length; i += 7) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
      n++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}
