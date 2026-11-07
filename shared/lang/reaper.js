// Armo un archivo de proyecto de Reaper (.rpp) que apunta a los WAV exportados.
// Es generación de texto pura (sin APIs de navegador ni de Node), así que se comparte y se prueba con tests.
// Estructura: una pista por stem, todos los ítems empiezan en 0, las pistas de instrumentos agrupadas en carpetas y una
// pista "MIX reference" en mute con la mezcla completa.

const q = (s) => `"${String(s).replace(/["\r\n]/g, ' ')}"`;
const num = (n) => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : '0');

function trackBlock({ name, file, seconds, muted = false, folder = 0, closes = 0 }) {
  const lines = [
    '  <TRACK',
    `    NAME ${q(name)}`,
    `    MUTESOLO ${muted ? 1 : 0} 0 0`,
    closes ? `    ISBUS 2 ${-closes}` : `    ISBUS ${folder ? '1 1' : '0 0'}`,
  ];
  if (file) {
    lines.push('    <ITEM', '      POSITION 0', '      SNAPOFFS 0', `      LENGTH ${num(seconds)}`, '      LOOP 0', `      NAME ${q(name)}`,
      '      <SOURCE WAVE', `        FILE ${q(file)}`, '      >', '    >');
  }
  lines.push('  >');
  return lines.join('\n');
}

// tracks: [{ name, file, group }] en el orden en que deben aparecer. mixFile: ruta de la mezcla completa (opcional).
export function buildReaperProject({ bpm = 120, seconds = 0, tracks = [], mixFile = null, sampleRate = 44100 }) {
  const out = ['<REAPER_PROJECT 0.1 "6.0/pulse-studio" 0', `  TEMPO ${num(bpm)} 4 4`, `  SAMPLERATE ${sampleRate} 0 0`];
  if (mixFile) out.push(trackBlock({ name: 'MIX (reference, muted)', file: mixFile, seconds, muted: true }));
  // Agrupo pistas consecutivas en carpetas cuando un grupo tiene más de una pista.
  const groups = [];
  for (const t of tracks) {
    const last = groups.at(-1);
    if (last && last.id === t.group) last.items.push(t);
    else groups.push({ id: t.group, items: [t] });
  }
  for (const g of groups) {
    if (g.items.length < 2 || !g.id) {
      for (const t of g.items) out.push(trackBlock({ ...t, seconds }));
      continue;
    }
    out.push(trackBlock({ name: g.id.toUpperCase(), file: null, seconds, folder: 1 }));
    g.items.forEach((t, i) => out.push(trackBlock({ ...t, seconds, closes: i === g.items.length - 1 ? 1 : 0 })));
  }
  out.push('>', '');
  return out.join('\n');
}

export function buildReadme({ title, bpm, seconds, bits, files, hasProject }) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return [
    `${title} - Pulse Studio pack`,
    '',
    `Tempo: ${bpm} BPM   Length: ${mins}:${String(secs).padStart(2, '0')}   Format: WAV ${bits}-bit, 44.1 kHz, stereo`,
    '',
    'Every file has exactly the same length and starts at the same point (time 0),',
    'so you can drop them on separate tracks at position 0 and they line up.',
    'The stems use the same level as the mix, so together they sound like mix.wav.',
    '(Noise sounds such as hats and snares are random, so their waveform differs a little from one render to the next.)',
    '',
    'Files',
    ...files.map((f) => `  ${f}`),
    '',
    'Reaper',
    hasProject
      ? '  1. Open project.rpp (keep the folders next to it). Tracks, tempo and folders are created for you.\n  2. The MIX track is muted: it is only a reference to compare against.'
      : '  1. Create a new project and set the tempo to the BPM above.',
    '  Manual way: select all the stems in your file explorer and drag them into Reaper at 0:00.',
    '  Each stem is a ready track; leave mix.wav out (or mute it) so the audio is not doubled.',
    '',
    'Made with Pulse Studio.',
    '',
  ].join('\n');
}
