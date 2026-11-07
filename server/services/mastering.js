import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HttpError } from '../http.js';

// Cada preset es una cadena de filtros de ffmpeg que se aplica ANTES de normalizar el volumen.
// Todos los valores son conservadores: el objetivo es un resultado limpio y competitivo, no un rescate.
export const PRESETS = {
  clean: {
    description: 'Transparent: gentle glue compression',
    targetLufs: -14,
    chain: ['highpass=f=25', 'acompressor=threshold=-20dB:ratio=2:attack=30:release=250:makeup=1.5'],
  },
  punch: {
    description: 'More low end weight and presence, tighter dynamics',
    targetLufs: -12,
    chain: [
      'highpass=f=30',
      'equalizer=f=60:t=q:w=1:g=1.5',
      'acompressor=threshold=-18dB:ratio=3:attack=15:release=150:makeup=2',
      'equalizer=f=3500:t=q:w=1:g=1',
    ],
  },
  warm: {
    description: 'Softer top end and a touch of low-mid body',
    targetLufs: -14,
    chain: [
      'highpass=f=25',
      'equalizer=f=200:t=q:w=1:g=1',
      'equalizer=f=9000:t=q:w=1:g=-1.5',
      'acompressor=threshold=-20dB:ratio=2.5:attack=25:release=250:makeup=1.5',
    ],
  },
  loud: {
    description: 'Dense and loud, for club-style tracks',
    targetLufs: -9,
    chain: [
      'highpass=f=30',
      'acompressor=threshold=-16dB:ratio=4:attack=10:release=120:makeup=3',
      'equalizer=f=80:t=q:w=1:g=1',
    ],
  },
};

const TRUE_PEAK = -1.0;

function run(bin, args, { timeoutMs, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '';
    let stderr = '';
    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`${path.basename(bin)} timed out`));
        }, timeoutMs)
      : null;
    child.stdout.on('data', (d) => {
      stdout += d;
      if (stdout.length > 2_000_000) stdout = stdout.slice(-1_000_000);
    });
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error(`${bin} is not installed on the server`) : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} failed (exit ${code}): ${stderr.split('\n').slice(-6).join('\n')}`));
    });
  });
}

// Leo la firma RIFF/WAVE. Se usa en cada archivo subido antes de que ffmpeg lo toque.
export function looksLikeWav(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE';
  } finally {
    fs.closeSync(fd);
  }
}

export function createMastering({ config }) {
  const { ffmpeg, ffprobe, jobTimeoutMs, maxAudioSeconds } = config.master;

  async function probe(file) {
    const { stdout } = await run(
      ffprobe,
      ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,sample_rate,channels', '-of', 'json', file],
      { timeoutMs: 30_000 },
    );
    const info = JSON.parse(stdout);
    const audio = (info.streams ?? []).find((s) => s.codec_type === 'audio');
    const duration = Number(info.format?.duration);
    if (!audio || !Number.isFinite(duration)) throw new HttpError(400, 'The uploaded file is not valid audio');
    if (duration < 1) throw new HttpError(400, 'The audio is too short');
    if (duration > maxAudioSeconds) {
      throw new HttpError(400, `The audio is longer than the allowed ${Math.round(maxAudioSeconds / 60)} minutes`);
    }
    return { duration, sampleRate: Number(audio.sample_rate), channels: Number(audio.channels) };
  }

  function parseLoudnormJson(stderr) {
    const start = stderr.lastIndexOf('{');
    const end = stderr.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Could not read loudness analysis');
    return JSON.parse(stderr.slice(start, end + 1));
  }

  async function measure(file, filters) {
    const af = [...filters, `loudnorm=I=-14:TP=${TRUE_PEAK}:LRA=11:print_format=json`].join(',');
    const { stderr } = await run(ffmpeg, ['-hide_banner', '-nostats', '-i', file, '-af', af, '-f', 'null', '-'], {
      timeoutMs: jobTimeoutMs,
    });
    return parseLoudnormJson(stderr);
  }

  // Mastering en dos pasadas: analizo la señal procesada y después normalizo con los valores medidos.
  // Devuelvo métricas para el README y para la API.
  async function master({ input, outWav, outMp3, preset = 'clean', targetLufs }) {
    const def = PRESETS[preset];
    if (!def) throw new HttpError(400, `Unknown preset "${preset}"`);
    const target = targetLufs ?? def.targetLufs;

    const info = await probe(input);

    const first = await measure(input, def.chain);
    if (!Number.isFinite(Number(first.input_i)) || Number(first.input_i) < -70) {
      throw new HttpError(400, 'The audio is silent or almost silent, there is nothing to master');
    }

    const loudnorm =
      `loudnorm=I=${target}:TP=${TRUE_PEAK}:LRA=11` +
      `:measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}` +
      `:measured_thresh=${first.input_thresh}:offset=${first.target_offset}:linear=true`;
    // alimiter es una última red de seguridad justo debajo del techo de true-peak; aresample deshace el sobremuestreo interno de loudnorm.
    const af = [...def.chain, loudnorm, 'alimiter=limit=0.89:level=0', 'aresample=44100'].join(',');

    await run(
      ffmpeg,
      ['-hide_banner', '-nostats', '-y', '-i', input, '-af', af, '-ar', '44100', '-c:a', 'pcm_s24le', outWav],
      { timeoutMs: jobTimeoutMs },
    );
    await run(ffmpeg, ['-hide_banner', '-nostats', '-y', '-i', outWav, '-c:a', 'libmp3lame', '-b:a', '320k', outMp3], {
      timeoutMs: jobTimeoutMs,
    });

    // Mido el resultado real para que el informe sea honesto.
    const final = await measure(outWav, []);
    return {
      preset,
      targetLufs: target,
      inputLufs: Number(Number(first.input_i).toFixed(1)),
      outputLufs: Number(Number(final.input_i).toFixed(1)),
      outputTruePeakDb: Number(Number(final.input_tp).toFixed(1)),
      durationSeconds: Number(info.duration.toFixed(1)),
    };
  }

  // Exportación a MP3 simple (sin mastering): para compartir rápido la mezcla cruda.
  async function toMp3({ input, outMp3 }) {
    const info = await probe(input);
    await run(ffmpeg, ['-hide_banner', '-nostats', '-y', '-i', input, '-c:a', 'libmp3lame', '-b:a', '320k', outMp3], {
      timeoutMs: jobTimeoutMs,
    });
    return { durationSeconds: Number(info.duration.toFixed(1)) };
  }

  return { master, toMp3, probe };
}
