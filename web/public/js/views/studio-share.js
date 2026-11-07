// Ventana para compartir la canción con un link público.
import { api } from '../api.js';
import { h, modal, copyText } from '../dom.js';

// Muestro el estado actual y los botones para crear o apagar el link; `ctx` me da el proyecto y cómo guardarlo.
export async function openShare(ctx) {
  const bodyEl = h('div');
  const actionsEl = h('div', { class: 'modal-actions', style: 'padding:0' });
  const show = (p) => {
    const url = `${location.origin}/s/${p.shareSlug}`;
    const input = h('input', { class: 'input mono', readonly: true, value: url, onfocus: (e) => e.target.select() });
    bodyEl.replaceChildren(p.shared
      ? h('div', {}, h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Anyone with this link can listen and play with a copy of the code. Your edits after sharing are visible too.'), input)
      : h('p', { class: 'muted' }, 'Sharing is off. Turn it on to get a public link to this song.'));
    // Cambio el estado en el servidor y vuelvo a dibujar con el proyecto actualizado.
    const toggle = (on) => async () => { if (on) await ctx.flush(); show(ctx.setProject((await api.shareProject(ctx.project().id, on)).project)); };
    actionsEl.replaceChildren(...(p.shared
      ? [h('button', { class: 'btn danger', onclick: toggle(false) }, 'Stop sharing'), h('button', { class: 'btn primary', onclick: () => copyText(url) }, 'Copy link')]
      : [h('button', { class: 'btn primary', onclick: toggle(true) }, 'Create public link')]));
  };
  modal({ title: 'Share this song', body: [bodyEl, h('div', { style: 'margin-top:16px' }, actionsEl)] });
  show(ctx.project());
}
