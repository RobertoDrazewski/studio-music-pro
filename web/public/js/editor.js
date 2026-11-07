// Editor de código: un <textarea> transparente sobre una capa resaltada, más una columna de números de línea.
// El textarea conserva el comportamiento nativo (selección, deshacer, IME, móvil) y la capa solo pinta colores.
import { h } from './dom.js';
import { highlight } from './highlight.js';

export class Editor {
  constructor({ value = '', readOnly = false, onChange, placeholder = '' } = {}) {
    this.onChange = onChange;
    this.baseReadOnly = readOnly;
    this.errors = [];
    this.warnings = [];
    this.activeLines = new Set();
    this.gutter = h('div', { class: 'ed-gutter', 'aria-hidden': 'true' });
    this.layer = h('div', { class: 'ed-layer', 'aria-hidden': 'true' });
    this.input = h('textarea', {
      class: 'ed-input',
      spellcheck: 'false',
      autocomplete: 'off',
      autocapitalize: 'off',
      'aria-label': 'Song code',
      placeholder,
      readonly: readOnly,
      wrap: 'off',
    });
    this.input.value = value;
    this.scroller = h('div', { class: 'ed-scroll' }, this.layer, this.input);
    this.el = h('div', { class: 'editor' }, this.gutter, this.scroller);

    this.input.addEventListener('input', () => {
      this.paint();
      this.onChange?.(this.value);
    });
    this.input.addEventListener('scroll', () => this.syncScroll());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.paint();
  }

  get value() {
    return this.input.value;
  }

  setValue(text, { silent = false } = {}) {
    this.input.value = text;
    this.paint();
    if (!silent) this.onChange?.(text);
  }

  focus() {
    this.input.focus();
  }

  setDiagnostics({ errors = [], warnings = [] }) {
    this.errors = errors;
    this.warnings = warnings;
    this.paint();
  }

  setActiveLines(lines) {
    this.activeLines = new Set(lines);
    this.paint();
  }

  // Sangría de dos espacios con Tab, como un editor de verdad.
  onKey(e) {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || this.input.readOnly) return;
    e.preventDefault();
    const { selectionStart: s, selectionEnd: en, value } = this.input;
    this.input.setRangeText('  ', s, en, 'end');
    this.input.dispatchEvent(new Event('input'));
    void value;
  }

  paint() {
    const text = this.value;
    const lineCount = text.split('\n').length;
    const errorLines = new Set(this.errors.map((e) => e.line));
    const warnLines = new Set(this.warnings.map((e) => e.line));
    this.layer.innerHTML = highlight(text, { errorLines, warnLines, activeLines: this.activeLines }) + '<div class="ed-pad"> </div>';
    let g = '';
    for (let i = 1; i <= lineCount; i++) g += `<div class="${errorLines.has(i) ? 'err' : ''}">${i}</div>`;
    this.gutter.innerHTML = g;
    this.syncScroll();
  }

  syncScroll() {
    this.layer.style.transform = `translate(${-this.input.scrollLeft}px, ${-this.input.scrollTop}px)`;
    this.gutter.style.transform = `translateY(${-this.input.scrollTop}px)`;
  }

  // Escribo texto en el editor como lo haría una persona. Termina al acabar o al cancelar.
  // `onLine(textoHastaAhora)` corre después de cada línea completa, así la música sigue al tipeo.
  async typeIn(text, { onLine, cps = 38, signal } = {}) {
    this.input.readOnly = true;
    this.setValue('', { silent: true });
    let typed = '';
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      for (let i = 0; i < text.length; i++) {
        if (signal?.aborted) break;
        const ch = text[i];
        typed += ch;
        this.input.value = typed;
        this.paint();
        this.input.scrollTop = this.input.scrollHeight;
        this.syncScroll();
        if (ch === '\n') {
          onLine?.(typed);
          await sleep(180);
        } else {
          const comment = /\/\/[^\n]*$/.test(typed);
          await sleep(comment ? 8 : 1000 / cps + Math.random() * 14);
        }
      }
    } finally {
      this.input.readOnly = this.baseReadOnly;
      if (signal?.aborted) {
        this.setValue(text, { silent: true });
      }
      onLine?.(this.value);
    }
  }
}
