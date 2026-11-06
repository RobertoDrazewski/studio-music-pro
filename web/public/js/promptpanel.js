// "Build by clicks": a guided prompt builder. Clicks + free text -> one precise prompt (shared/lang/promptbuilder.js).

import { h } from './dom.js';
import { INSTRUMENTS, LIMITS } from '/shared/lang/spec.js';
import {
  MOODS, ENERGIES, STRUCTURES, BASS_TYPES, FEELS, FX_CHOICES, KEY_ROOTS, KEY_SCALES,
  emptySelection, composePrompt, selectionIsEmpty,
} from '/shared/lang/promptbuilder.js';

export function createPromptPanel({ getStyleName, freeText, onChange = () => {} }) {
  const sel = emptySelection();
  const root = h('details', { class: 'pb', open: true });
  const preview = h('pre', { class: 'pb-preview' });

  const changed = () => { preview.textContent = composePrompt(sel, freeText.value, { styleName: getStyleName() }) || 'Pick options above or just write below.'; onChange(); };

  const chip = (label, on, toggle, title = '') =>
    h('button', { type: 'button', class: `pb-chip${on ? ' on' : ''}`, 'aria-pressed': String(on), title, onclick: () => { toggle(); render(); changed(); } }, label);
  const group = (title, ...kids) => h('div', { class: 'pb-group' }, h('div', { class: 'pb-title' }, title), h('div', { class: 'pb-chips' }, ...kids));
  const toggleIn = (arr, v) => { const i = arr.indexOf(v); i >= 0 ? arr.splice(i, 1) : arr.push(v); };
  const single = (key, id) => { sel[key] = sel[key] === id ? '' : id; };

  function render() {
    const bpm = h('input', { class: 'input pb-num', type: 'number', min: 40, max: 240, placeholder: 'style default', value: sel.bpm ?? '', 'aria-label': 'Tempo in bpm' });
    bpm.addEventListener('input', () => { sel.bpm = bpm.value ? Number(bpm.value) : null; changed(); });
    const root_ = h('select', { class: 'select small-select', 'aria-label': 'Key note' }, h('option', { value: '' }, 'key: auto'), KEY_ROOTS.map((k) => h('option', { value: k, selected: k === sel.keyRoot }, k.toUpperCase())));
    root_.addEventListener('change', () => { sel.keyRoot = root_.value; changed(); });
    const scale = h('select', { class: 'select small-select', 'aria-label': 'Scale' }, KEY_SCALES.map((k) => h('option', { value: k, selected: k === sel.keyScale }, k)));
    scale.addEventListener('change', () => { sel.keyScale = scale.value; changed(); });

    const vText = h('input', { class: 'input', maxlength: LIMITS.maxVoiceChars, placeholder: 'Words to say (spoken, not sung)', value: sel.voice.text });
    vText.addEventListener('input', () => { sel.voice.text = vText.value; changed(); });
    const vGender = h('select', { class: 'select small-select', 'aria-label': 'Voice' }, ['female', 'male'].map((g) => h('option', { value: g, selected: g === sel.voice.gender }, g)));
    vGender.addEventListener('change', () => { sel.voice.gender = vGender.value; changed(); });

    const aiLy = h('input', { type: 'checkbox', checked: sel.voice.aiLyrics, 'aria-label': 'Let the AI write the lyrics' });
    aiLy.addEventListener('change', () => { sel.voice.aiLyrics = aiLy.checked; render(); changed(); });
    vText.placeholder = sel.voice.aiLyrics ? 'Theme of the lyrics, e.g. night in the city' : 'Words to say (spoken, not sung)';
    const lang = h('select', { class: 'select small-select', 'aria-label': 'Lyrics language' }, ['English', 'Spanish', 'Portuguese', 'French'].map((l) => h('option', { value: l, selected: l === sel.voice.lang }, l)));
    lang.addEventListener('change', () => { sel.voice.lang = lang.value; changed(); });
    root.replaceChildren(
      h('summary', {}, 'Build by clicks'),
      group('Mood', MOODS.map((m) => chip(m, sel.moods.includes(m), () => toggleIn(sel.moods, m)))),
      h('div', { class: 'pb-group' }, h('div', { class: 'pb-title' }, 'Tempo and key'), h('div', { class: 'pb-chips' }, bpm, h('span', { class: 'muted' }, 'bpm'), root_, scale)),
      group('Energy', ENERGIES.map((e) => chip(e.label, sel.energy === e.id, () => single('energy', e.id), e.text))),
      group('Structure', STRUCTURES.map((e) => chip(e.label, sel.structure === e.id, () => single('structure', e.id), e.text))),
      group('Instruments', INSTRUMENTS.map((i) => chip(i, sel.instruments.includes(i), () => toggleIn(sel.instruments, i)))),
      group('Bass', BASS_TYPES.map((e) => chip(e.label, sel.bass === e.id, () => single('bass', e.id), e.text))),
      group('Feel', FEELS.map((e) => chip(e.label, sel.feel === e.id, () => { sel.feel = e.id; }))),
      group('Sound', FX_CHOICES.map((e) => chip(e.label, sel.fx.includes(e.id), () => toggleIn(sel.fx, e.id), e.text))),
      h('div', { class: 'pb-group' }, h('div', { class: 'pb-title' }, 'Voice'),
        h('div', { class: 'pb-chips' }, chip(sel.voice.on ? 'Voice: on' : 'Voice: off', sel.voice.on, () => { sel.voice.on = !sel.voice.on; }), sel.voice.on ? [vGender, h('label', { class: 'muted', style: 'font-size:12px' }, aiLy, ' AI writes the lyrics'), sel.voice.aiLyrics ? lang : null] : null),
        sel.voice.on ? vText : null),
      h('div', { class: 'pb-actions' }, h('button', { type: 'button', class: 'btn small', onclick: () => { Object.assign(sel, emptySelection()); render(); changed(); } }, 'Clear clicks')),
      h('div', { class: 'pb-title' }, 'What the AI will receive'), preview);
  }

  freeText.addEventListener('input', changed);
  render();
  changed();
  return {
    el: root,
    compose: () => composePrompt(sel, freeText.value, { styleName: getStyleName() }),
    hasClicks: () => !selectionIsEmpty(sel),
    refresh: changed,
  };
}
