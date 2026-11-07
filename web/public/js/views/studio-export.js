// Ventana de exportación: master, MP3, WAV y el pack de estudio para Reaper.
// La armo aparte de studio.js para que ese archivo no crezca sin control.
import { api } from '../api.js';
import { h, toast, modal, download } from '../dom.js';
import { session } from '../main.js';
import { exportViaServer, exportWav, exportStudioPack, estimatePackMb } from '../export.js';

// Abro el diálogo y dejo que cada botón corra su exportación con barra de progreso.
export async function openExport({ locked, lockedModal, player, editor, title, flush }) {
  if (locked) return lockedModal();
  if (!player.playable) return toast('Fix the errors (or add a section) before exporting', 'error');
  await flush();
  let presets = [];
  try { presets = (await api.presets()).presets; } catch { /* handled by empty list */ }
  const preset = h('select', { class: 'select' }, presets.map((p) => h('option', { value: p.id }, `${p.id}: ${p.description}`)));
  const lufs = h('input', { class: 'input', type: 'number', min: -23, max: -6, step: 0.5, placeholder: 'Preset default' });
  const nameInput = h('input', { class: 'input', value: title.value || 'song', maxlength: 100 });
  const mq = session.quota?.master;
  const mqText = mq ? (mq.limit === null ? 'Masters today: unlimited' : `Masters today: ${mq.remaining} of ${mq.limit} left`) : '';
  const packMode = h('select', { class: 'select' },
    h('option', { value: 'instrument' }, 'Each instrument (kick, bass, pad, lead, voices…)'),
    h('option', { value: 'group' }, 'Groups (percussion, bass, mids, lead, voices)'),
    h('option', { value: 'both' }, 'Both: instruments and groups'));
  const packBits = h('select', { class: 'select' }, h('option', { value: '24' }, '24-bit'), h('option', { value: '16' }, '16-bit (smaller)'));
  const packRpp = h('input', { type: 'checkbox', checked: true });
  const packNote = h('p', { class: 'muted', style: 'font-size:12px' });
  const updatePackNote = () => {
    const mb = estimatePackMb(player.ast, packMode.value, Number(packBits.value));
    packNote.textContent = `About ${mb} MB. Every file has the same length and starts at 0, so they line up in any DAW.${mb > 600 ? ' Large: try 16-bit or groups.' : ''}`;
  };
  packMode.addEventListener('change', updatePackNote); packBits.addEventListener('change', updatePackNote); updatePackNote();
  const stage = h('div');
  const form = h('div', {},
    h('img', { class: 'stage-img', src: '/img/master-processing-wide.jpg', alt: '' }),
    h('div', { class: 'field' }, h('label', {}, 'File name'), nameInput),
    h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:2;min-width:200px' }, h('label', {}, 'Mastering preset'), preset),
      h('div', { class: 'field', style: 'flex:1;min-width:120px' }, h('label', {}, 'Target LUFS'), lufs)),
    h('div', { class: 'pack-box' },
      h('h4', {}, 'Studio pack for Reaper (free, made in your browser)'),
      h('div', { class: 'row' },
        h('div', { class: 'field', style: 'flex:2;min-width:180px' }, h('label', {}, 'Separate files'), packMode),
        h('div', { class: 'field', style: 'flex:1;min-width:110px' }, h('label', {}, 'Bit depth'), packBits)),
      h('label', { class: 'check' }, packRpp, ' Include a Reaper project (project.rpp)'),
      packNote),
    h('p', { class: 'muted', style: 'font-size:13px' }, `${mqText}${mqText ? ' · ' : ''}The mix and each instrument are rendered in your browser, so a long song can take a minute.`),
    stage);
  let running = null;
  const m = modal({ title: 'Export', body: form, wide: true, onClose: () => running?.abort() });

  const setStage = (text, pct) => {
    stage.replaceChildren(h('p', { class: 'mono', style: 'margin-top:12px' }, text), h('div', { class: 'big-bar' }, h('i', { style: `width:${Math.round((pct ?? 0) * 100)}%` })));
  };
  const buttons = [];
  const lock = (v) => buttons.forEach((b) => (b.disabled = v));
  const run = async (kind) => {
    running = new AbortController();
    lock(true);
    try {
      const t = nameInput.value.trim() || 'song';
      if (kind === 'pack') {
        let pct = 0;
        const res = await exportStudioPack({
          ast: player.ast, code: editor.value, title: t, mode: packMode.value, bits: Number(packBits.value), rpp: packRpp.checked,
          onStatus: (s) => setStage(s, pct), onProgress: (p) => { pct = p * 0.9; },
        });
        stage.replaceChildren(h('p', { class: 'mono' }, `✓ Studio pack downloaded (${res.files} files, ${Math.round(res.bytes / 1e6)} MB)`));
      } else if (kind === 'wav') {
        setStage('Rendering…', 0.4);
        await exportWav(player.ast, t, (s) => setStage(s, 0.4));
        stage.replaceChildren(h('p', { class: 'mono' }, '✓ WAV downloaded'));
      } else {
        let pct = 0;
        const res = await exportViaServer({
          ast: player.ast, code: editor.value, title: t, kind, preset: preset.value,
          targetLufs: lufs.value ? Number(lufs.value) : undefined, signal: running.signal,
          onStatus: (s) => setStage(s, pct), onProgress: (p) => { pct = p * 0.7; },
        });
        setStage('Downloading…', 1);
        const r = await fetch(res.url, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('Download failed');
        download(await r.blob(), res.filename);
        const metrics = res.job.metrics;
        stage.replaceChildren(
          h('img', { class: 'stage-img', src: '/img/master-result-wide.jpg', alt: '' }),
          h('p', { class: 'mono' }, '✓ Done. Your download has started.'),
          metrics?.outputLufs !== undefined ? h('p', { class: 'muted mono', style: 'font-size:13px' }, `Loudness ${metrics.outputLufs} LUFS · true peak ${metrics.outputTruePeakDb} dBTP`) : null);
        const me = await api.me().catch(() => null);
        if (me) session.quota = me.quota;
      }
    } catch (e) {
      stage.replaceChildren(h('p', { class: 'error-text' }, e.message));
    } finally { lock(false); running = null; }
  };
  const bMaster = h('button', { class: 'btn primary', onclick: () => run('master') }, 'Master + stems (ZIP)');
  const bMp3 = h('button', { class: 'btn', onclick: () => run('mp3') }, 'MP3 of the mix');
  const bWav = h('button', { class: 'btn', onclick: () => run('wav') }, 'WAV of the mix');
  const bPack = h('button', { class: 'btn primary', onclick: () => run('pack') }, 'Studio pack for Reaper (ZIP)');
  buttons.push(bMaster, bMp3, bWav, bPack);
  m.el.querySelector('.modal').append(h('div', { class: 'modal-actions' }, bWav, bMp3, bMaster, bPack));
}

