// Lógica pura de planificación de las canciones Pulse. Sin audio ni APIs del navegador: el motor
// de audio pregunta "¿qué pasa en el compás N?" y convierte la respuesta en sonido.
// Al tenerlo separado, las reglas musicales se pueden probar en Node.

import { DRUMS } from './spec.js';

export const BEATS_PER_BAR = 4;

export function barSeconds(bpm) {
  return (BEATS_PER_BAR * 60) / bpm;
}

export function totalBars(ast) {
  return ast.sections.reduce((sum, s) => sum + s.bars, 0);
}

// Busco la sección que suena en `barIndex` (desde 0, contando desde el inicio de la canción).
// Devuelvo null cuando la canción terminó (sin loop) o no tiene secciones.
export function locate(ast, barIndex) {
  const total = totalBars(ast);
  if (!total) return null;
  let pos = barIndex;
  if (pos >= total) {
    if (!ast.loop) return null;
    pos %= total;
  }
  let start = 0;
  for (let i = 0; i < ast.sections.length; i++) {
    const section = ast.sections[i];
    if (pos < start + section.bars) {
      return { section, sectionIndex: i, barInSection: pos - start, songBar: pos };
    }
    start += section.bars;
  }
  return null;
}

// Número pseudoaleatorio determinista en [0, 1) para que los pasos "x?" se comporten igual
// en la vista previa, en el render de la mezcla y en cada render de stem.
export function chanceValue(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Qué instrumentos se oyen según los mute/solo de la propia canción más los cambios en vivo.
export function audibleSet(ast, overrides = {}) {
  const solo = new Set([...(ast.solo ?? []), ...(overrides.solo ?? [])]);
  const mute = new Set([...(ast.mute ?? []), ...(overrides.mute ?? [])]);
  return (instrument) => (solo.size ? solo.has(instrument) : !mute.has(instrument));
}

// Eventos de una pista dentro de un compás.
// `position` es la fracción del compás (de 0 a 1) donde empieza el paso.
export function planTrack(track, trackIndex, songBar) {
  const n = track.steps.length;
  const isDrum = DRUMS.includes(track.instrument);
  const events = [];
  for (let i = 0; i < n; i++) {
    const step = track.steps[i];
    if (step.kind === 'rest' || step.kind === 'hold') continue;
    if (step.chance < 1 && chanceValue(trackIndex + 1, songBar + 1, i + 1) >= step.chance) continue;

    // Un disparo dura hasta el siguiente disparo o silencio, alargado por los "_" que lo siguen.
    let length = 1;
    if (!isDrum) {
      while (i + length < n && track.steps[i + length].kind === 'hold') length++;
    }
    events.push({
      step: i,
      steps: n,
      position: i / n,
      length: length / n, // fracción del compás
      swingable: i % 2 === 1,
      kind: step.kind, // 'hit' | 'note'
      notes: step.notes ?? [],
      repeat: step.repeat ?? 1,
    });
  }
  return events;
}

// Cambios de efectos por instrumento activos en este compás ("every N bars: ...").
// Devuelvo Map<instrumento, Array<{name,args}>>.
export function activeEvery(section, barInSection) {
  const out = new Map();
  for (const rule of section.every ?? []) {
    if ((barInSection + 1) % rule.every === 0) {
      out.set(rule.instrument, [...(out.get(rule.instrument) ?? []), ...rule.effects]);
    }
  }
  return out;
}

// Identidad estable del diseño de sonido de una pista. Dos pistas con la misma firma pueden compartir una cadena de audio.
export function trackSignature(track, section) {
  const everyFx = (section.every ?? []).filter((r) => r.instrument === track.instrument).flatMap((r) => r.effects.map((e) => e.name));
  return JSON.stringify([track.instrument, track.wave, track.effects, [...new Set(everyFx)].sort()]);
}

// Identidad estable de un clip hablado (qué se dice, quién y cómo). Es la misma en el servidor (caché) y en el navegador.
export function voiceKey(v) {
  return JSON.stringify([v.voice, v.style ?? '', v.text]);
}

// Cada clip distinto de la canción, en orden.
export function songVoices(ast) {
  const seen = new Map();
  for (const section of ast.sections) {
    for (const v of section.voices ?? []) {
      const key = voiceKey(v);
      if (!seen.has(key)) seen.set(key, { key, text: v.text, voice: v.voice, style: v.style, line: v.line });
    }
  }
  return [...seen.values()];
}

// Nombres de los instrumentos distintos que aparecen en la canción (sirve para los stems).
export function songInstruments(ast) {
  const seen = [];
  for (const section of ast.sections) {
    for (const track of section.tracks) {
      if (!seen.includes(track.instrument)) seen.push(track.instrument);
    }
  }
  // Los clips hablados cuentan como un "instrumento" más para poder silenciarlos, ponerlos en solo y exportarlos como stem.
  if (ast.sections.some((s) => (s.voices ?? []).length)) seen.push('voice');
  return seen;
}
