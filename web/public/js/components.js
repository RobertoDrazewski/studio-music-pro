// Piezas de interfaz compartidas: selector de idioma y avatar.
import { h } from './dom.js';
import { icon } from './icons.js';
import { LANGS, getLang, setLang } from './i18n.js';

// Selector "EN | ES" con un globo. Se mantiene sincronizado cuando el idioma cambia desde cualquier lado.
export function langSwitch() {
  const wrap = h('div', { class: 'lang-switch', role: 'group', 'aria-label': 'Language' }, icon('globe', { size: 15 }));
  const buttons = LANGS.map(([code]) => {
    const b = h('button', { type: 'button', 'data-lang': code, 'aria-label': code === 'en' ? 'English' : 'Español', onclick: () => setLang(code) }, code.toUpperCase());
    wrap.append(b);
    return b;
  });
  const sync = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
  sync();
  window.addEventListener('lang:change', sync);
  return wrap;
}

// Pie de página con autoría, derechos, contacto y el sitio de Puma Code.
export function siteFooter() {
  const year = new Date().getFullYear();
  return h('footer', { class: 'site-foot' },
    h('a', { class: 'foot-brand', href: 'https://www.puma-code.com', target: '_blank', rel: 'noopener', 'aria-label': 'Puma Code' },
      h('img', { src: '/img/puma-code.png', alt: '', width: 40, height: 36 })),
    h('div', { class: 'foot-text' },
      h('span', {}, 'Pulse Studio is a product by Puma Code.'),
      h('span', { class: 'foot-rights' }, h('span', { 'data-notranslate': '' }, `© ${year} Puma Code.`), ' ', h('span', {}, 'All rights reserved.'))),
    h('nav', { class: 'foot-links', 'aria-label': 'Contact' },
      h('a', { href: 'mailto:info@puma-code.com', 'data-notranslate': '' }, icon('mail', { size: 15 }), 'info@puma-code.com'),
      h('a', { href: 'https://www.puma-code.com', target: '_blank', rel: 'noopener', 'data-notranslate': '' }, icon('globe', { size: 15 }), 'www.puma-code.com')));
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase();
}

// Avatar redondo: la foto si el usuario tiene una, las iniciales si no.
export function avatarEl(user, size = 32) {
  const el = h('span', { class: 'avatar', 'data-notranslate': '', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px` });
  if (user?.avatar) el.append(h('img', { src: user.avatar, alt: '' }));
  else el.textContent = initials(user?.name || user?.email);
  return el;
}
