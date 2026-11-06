import { api } from '../api.js';
import { h } from '../dom.js';
import { Editor } from '../editor.js';
import { Player, createScope, createTransport } from '../player.js';
import { session, link, brand } from '../main.js';
import { APP_NAME } from '../config.js';

export async function mount(root, slug) {
  let song;
  try {
    ({ song } = await api.sharedSong(slug));
  } catch {
    root.append(h('header', { class: 'nav' }, brand()), h('div', { class: 'share' }, h('h1', {}, 'Song not found'), h('p', { class: 'muted' }, 'The link may be wrong or the author stopped sharing it.'), link('/', { class: 'btn' }, 'Go to start')));
    return;
  }
  document.title = `${song.title} · ${APP_NAME}`;
  const editor = new Editor({ value: song.code, onChange: () => player.sync() });
  const player = new Player(editor);
  player.sync();
  const scope = createScope(player);
  const transport = createTransport(player);
  const diag = h('div', { class: 'diag' }, h('span', { class: 'ok' }, '● ok'));
  player.on((e) => {
    if (e.type === 'parsed') diag.replaceChildren(...(e.result.errors.length ? e.result.errors.slice(0, 3).map((x) => h('div', { class: 'e' }, `line ${x.line}: ${x.message}`)) : [h('span', { class: 'ok' }, '● ok')]));
  });
  root.append(
    h('header', { class: 'nav' }, brand(), h('span', { class: 'spacer' }), session.user ? link('/studio', { class: 'btn small' }, 'Open studio') : link('/login', { class: 'btn small' }, 'Sign in')),
    h('main', { class: 'share' },
      h('div', {}, h('h1', {}, song.title), h('p', { class: 'muted' }, `by ${song.author}`)),
      scope.el, transport.el,
      h('div', { class: 'term' }, h('div', { class: 'term-bar' }, h('i'), h('i'), h('i'), h('span', {}, 'read and tweak: your edits are not saved')), editor.el, diag),
      h('p', { class: 'muted' }, 'Press play, then change the code to hear what each line does.')));
  return () => { player.dispose(); scope.stop(); };
}
