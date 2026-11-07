// Asistente de "Nueva canción": una charla corta (nombre, estilo, sonido, duración y detalles) y después la IA arma la canción
// completa de una sola vez. Las preguntas son fijas, así que no cuestan nada; solo "Crear" usa la IA.
import { h, clear, modal, toast } from '../dom.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { STYLE_BY_ID, detectStyle } from '../../shared/lang/styles.js';

// Estilos que muestro como botones; cualquier otro se puede escribir.
const POPULAR = ['house', 'deep-house', 'techno', 'trap', 'lofi', 'ambient', 'synthwave', 'drum-and-bass', 'psytrance', 'dub'];

// Cómo puede sonar: cada opción le agrega una frase al pedido que le llega a la IA.
const TRAITS = [
  ['deep', 'Deep bass', 'a deep, firm low end with a sub bass under the bass'],
  ['warm', 'Warm and soft', 'warm, soft mids (pads and chords with a low lowpass)'],
  ['gentle', 'Gentle melodies', 'gentle melodies in low octaves: no harsh high notes and no toy-piano sound'],
  ['bright', 'Bright and shiny', 'a brighter, shinier sound without being harsh'],
  ['dark', 'Dark mood', 'a dark, moody feel'],
  ['energy', 'High energy', 'high energy and a strong groove'],
  ['chill', 'Relaxed', 'a relaxed, spacious feel'],
  ['drops', 'Big drops', 'strong builds and big drops'],
];
const LENGTHS = [[1, '1 minute'], [2, '2 minutes'], [3, '3 minutes']];

// Caracteres que suele tener una canción por minuto: sirve para calcular el avance de la barra.
const CHARS_PER_MINUTE = 2600;

export function openNewSong({ createBlank, onCreated, onQuota }) {
  // Lo que el usuario fue contestando.
  const a = { name: '', styleId: null, styleText: '', surprise: false, traits: new Set(), soundText: '', minutes: 2, extra: '' };
  let current = { onText: null };
  let busy = null; // { abort } mientras la IA trabaja

  const thread = h('div', { class: 'nsw-thread', role: 'log', 'aria-live': 'polite' });
  const chipsBox = h('div', { class: 'nsw-chips' });
  const input = h('input', { class: 'nsw-input', type: 'text', maxlength: '300', autocomplete: 'off', enterkeyhint: 'send' });
  const composer = h('form', { class: 'nsw-composer', onsubmit: (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !current.onText) return;
    input.value = '';
    current.onText(text);
  } }, input, h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Send' }, '➤'));
  const blankBtn = h('button', { class: 'btn small', type: 'button', onclick: () => makeBlank() }, 'Start with an empty song');
  const nowBtn = h('button', { class: 'btn small', type: 'button', onclick: () => create() }, 'Create now with what I said');
  const chat = h('div', { class: 'nsw' }, thread, chipsBox, composer, h('div', { class: 'nsw-foot' }, blankBtn, nowBtn));

  const dlg = modal({ title: 'New song', body: chat, wide: true, onClose: () => busy?.abort() });
  dlg.el.querySelector('.modal').classList.add('nsw-modal');

  // ---------- piezas del chat ----------
  const scroll = () => requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
  const say = (...kids) => { thread.append(h('div', { class: 'nsw-msg bot' }, h('div', { class: 'nsw-bub' }, ...kids))); scroll(); };
  const reply = (text) => { thread.append(h('div', { class: 'nsw-msg me' }, h('div', { class: 'nsw-bub' }, text))); scroll(); };
  const chip = (label, onclick, { primary = false, pressed = null } = {}) =>
    h('button', { class: `nsw-chip${primary ? ' primary' : ''}`, type: 'button', 'aria-pressed': pressed === null ? null : String(pressed), onclick }, label);
  const setChips = (...chips) => { clear(chipsBox); chipsBox.append(...chips); };
  const ask = (placeholder, onText) => { current = { onText }; input.placeholder = placeholder; input.focus(); };

  // ---------- preguntas ----------
  function askName() {
    say('Hi! Let us build your song. What do you want to call it?');
    setChips(chip('Decide for me', () => { reply(t('Decide for me')); askStyle(); }));
    ask('Song name…', (v) => { a.name = v.slice(0, 80); reply(v); askStyle(); });
  }

  function askStyle() {
    say('What style do you want?');
    const pick = (id) => { a.styleId = id; a.surprise = false; a.styleText = ''; reply(STYLE_BY_ID[id].name); askSound(); };
    setChips(
      ...POPULAR.map((id) => chip(STYLE_BY_ID[id].name, () => pick(id))),
      chip('Surprise me', () => { a.styleId = null; a.surprise = true; reply(t('Surprise me')); askSound(); }),
    );
    // También se puede escribir: si coincide con un estilo lo uso, si no se lo paso a la IA como descripción.
    ask('Or write another style…', (v) => {
      const found = detectStyle(v);
      if (found) return pick(found.id);
      a.styleId = null; a.styleText = v; reply(v); askSound();
    });
  }

  function askSound() {
    say('How should it sound? Pick as many as you like.');
    const draw = () => setChips(
      ...TRAITS.map(([id, label]) => chip(label, () => { a.traits.has(id) ? a.traits.delete(id) : a.traits.add(id); draw(); }, { pressed: a.traits.has(id) })),
      chip('Next', next, { primary: true }),
    );
    const next = () => {
      const labels = TRAITS.filter(([id]) => a.traits.has(id)).map(([, label]) => t(label));
      reply([...labels, a.soundText].filter(Boolean).join(', ') || t('No preference'));
      askLength();
    };
    draw();
    ask('Or describe the sound…', (v) => { a.soundText = [a.soundText, v].filter(Boolean).join(', '); draw(); toast('Added. Press Next when you are ready.', 'info', 1800); });
  }

  function askLength() {
    say('How long should it be?');
    setChips(...LENGTHS.map(([m, label]) => chip(label, () => { a.minutes = m; reply(t(label)); askExtra(); })));
    current = { onText: null };
    input.placeholder = '';
  }

  function askExtra() {
    say('Anything else? Instruments, mood, a reference, voices… You can write it in Spanish or English.');
    setChips(chip('No, that is all', () => { reply(t('No, that is all')); askConfirm(); }));
    ask('For example: add a mellow bassline and a vocal chant…', (v) => { a.extra = v; reply(v); askConfirm(); });
  }

  const styleName = () => (a.styleId ? STYLE_BY_ID[a.styleId].name : a.styleText || t('Surprise me'));

  function askConfirm() {
    const soundLabels = TRAITS.filter(([id]) => a.traits.has(id)).map(([, label]) => t(label));
    const row = (k, v) => h('li', {}, h('b', {}, k), ' ', v);
    say('Ready! This is what I will create:', h('ul', { class: 'nsw-sum' },
      row('Name', a.name || 'I will pick one'),
      row('Style', styleName()),
      row('Sound', [...soundLabels, a.soundText].filter(Boolean).join(', ') || 'Open'),
      row('Length', LENGTHS.find(([m]) => m === a.minutes)[1]),
      a.extra ? row('Notes', a.extra) : null));
    setChips(chip('Create song', () => create(), { primary: true }), chip('Start over', () => restart()));
    current = { onText: null };
    input.placeholder = '';
  }

  function restart() {
    Object.assign(a, { name: '', styleId: null, styleText: '', surprise: false, soundText: '', minutes: 2, extra: '' });
    a.traits.clear();
    clear(thread);
    askName();
  }

  // ---------- crear ----------
  // Armo el pedido en inglés (la IA lo entiende mejor) y le sumo lo que el usuario escribió tal cual, en el idioma que sea.
  function buildPrompt() {
    const parts = [a.styleId ? `Create a ${STYLE_BY_ID[a.styleId].name} track.` : a.styleText ? `Create a track in this style: ${a.styleText}.` : 'Surprise me with a well-made electronic track.'];
    const sound = TRAITS.filter(([id]) => a.traits.has(id)).map(([, , phrase]) => phrase);
    if (a.soundText) sound.push(a.soundText);
    if (sound.length) parts.push(`Sound: ${sound.join('; ')}.`);
    if (a.extra) parts.push(`User notes (any language): ${a.extra}`);
    return parts.join(' ').slice(0, 1400);
  }

  async function makeBlank() {
    try {
      const { project } = await createBlank(a.name || 'Untitled song');
      dlg.close();
      onCreated(project);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function create() {
    const ctl = new AbortController();
    const fill = h('i');
    const stat = h('p', { class: 'nsw-stat' });
    const note = h('p', { class: 'muted' }, 'The AI is writing the arrangement, the bass and the mix. It appears all at once when it is ready.');
    const cancel = h('button', { class: 'btn', type: 'button', onclick: () => ctl.abort() }, 'Cancel');
    const view = h('div', { class: 'nsw-busy' }, h('h3', {}, 'Creating your song…'), h('div', { class: 'nsw-bar' }, fill), stat, note, h('div', { class: 'nsw-actions' }, cancel));
    clear(chat);
    chat.append(view);
    busy = ctl;

    // Avance real: el servidor dice cuántos caracteres lleva escritos; antes del primero avanzo un poquito por tiempo.
    let progress = { chars: 0, lines: 0, repairing: false };
    const started = Date.now();
    const expected = CHARS_PER_MINUTE * a.minutes;
    const paint = () => {
      const sec = Math.round((Date.now() - started) / 1000);
      const pct = progress.chars ? Math.min(97, (progress.chars / expected) * 100) : Math.min(6, sec * 2);
      fill.style.width = `${pct.toFixed(1)}%`;
      clear(stat);
      stat.append(h('span', {}, String(progress.lines)), ' ', h('span', {}, 'lines'), ' · ', h('span', {}, String(sec)), ' ', h('span', {}, 's'));
      if (progress.repairing) stat.append(' · ', h('span', {}, 'polishing the details'));
    };
    paint();
    const timer = setInterval(paint, 250);
    // Tope de espera por si algo se cuelga del todo.
    const hardStop = setTimeout(() => ctl.abort(), 240_000);

    try {
      const res = await api.generateStream(
        { prompt: buildPrompt(), style: a.styleId ?? 'auto', minutes: a.minutes },
        { signal: ctl.signal, onProgress: (p) => { progress = { ...progress, ...p, repairing: !!p.repairing }; } },
      );
      fill.style.width = '100%';
      onQuota?.(res.quota);
      const title = a.name || (a.styleId ? STYLE_BY_ID[a.styleId].name : 'New song');
      const { project } = await createBlank(title, res.code);
      busy = null;
      dlg.close();
      onCreated(project);
      toast('Your song is ready. Press Play to listen.', 'ok', 5000);
      if (res.warnings?.length) toast(`Created with ${res.warnings.length} warning(s). Check the editor.`, 'info');
    } catch (e) {
      busy = null;
      const cancelled = e.name === 'AbortError';
      if (!dlg.el.isConnected) return; // cerraron el cuadro: no hay nada que mostrar
      showFailure(cancelled ? 'Cancelled. Nothing was created.' : e.message);
    } finally {
      clearInterval(timer);
      clearTimeout(hardStop);
    }
  }

  function showFailure(message) {
    clear(chat);
    chat.append(h('div', { class: 'nsw-busy' },
      h('h3', {}, 'It did not work this time'),
      h('p', { class: 'nsw-error' }, message),
      h('div', { class: 'nsw-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { rebuild(); create(); } }, 'Try again'),
        h('button', { class: 'btn', type: 'button', onclick: () => { rebuild(); askConfirm(); } }, 'Back'))));
  }

  // Vuelvo a armar la pantalla del chat conservando las respuestas.
  function rebuild() {
    clear(chat);
    chat.append(thread, chipsBox, composer, h('div', { class: 'nsw-foot' }, blankBtn, nowBtn));
  }

  askName();
  return dlg;
}
