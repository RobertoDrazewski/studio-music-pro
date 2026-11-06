import { api } from './api.js';
import { h, clear, toast } from './dom.js';
import { APP_NAME } from './config.js';
import { registerServiceWorker } from './install.js';

const state = { user: null, mode: 'trial', quota: null };
let cleanup = null;
let renderToken = 0;

export const session = {
  get user() { return state.user; },
  get mode() { return state.mode; },
  get quota() { return state.quota; },
  async refresh() {
    try {
      const me = await api.me();
      Object.assign(state, { user: me.user, mode: me.mode, quota: me.quota });
    } catch {
      Object.assign(state, { user: null, quota: null });
    }
    return state.user;
  },
  clear() { Object.assign(state, { user: null, quota: null }); },
  set quota(q) { state.quota = q; },
};

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return render();
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  return render();
}

export function link(href, props, ...children) {
  return h('a', { href, ...props, onclick: (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    navigate(href);
  } }, ...children);
}

export function brand() {
  return link('/', { class: 'brand' }, h('img', { src: '/img/logo-mark.jpg', alt: '', width: 32, height: 32 }), APP_NAME);
}

const routes = [
  [/^\/$/, () => import('./views/landing.js'), { public: true }],
  [/^\/login\/?$/, () => import('./views/login.js'), { public: true }],
  [/^\/s\/([^/]+)\/?$/, () => import('./views/share.js'), { public: true }],
  [/^\/studio(?:\/([^/]+))?\/?$/, () => import('./views/studio.js')],
  [/^\/admin\/?$/, () => import('./views/admin.js'), { admin: true }],
];

async function render() {
  const token = ++renderToken;
  const path = location.pathname;
  cleanup?.();
  cleanup = null;
  const root = clear(document.getElementById('app'));
  window.scrollTo(0, 0);

  let match = null;
  for (const [re, loader, opts] of routes) {
    const m = re.exec(path);
    if (m) { match = { loader, opts: opts ?? {}, params: m.slice(1) }; break; }
  }
  if (!match) return navigate('/', { replace: true });

  if (!state.user && !(await session.refresh()) && !match.opts.public) {
    return navigate('/login', { replace: true });
  }
  if (state.user?.mustChangePassword && !/^\/login/.test(path)) return navigate('/login', { replace: true });
  if (match.opts.admin && state.user?.role !== 'superadmin') return navigate('/studio', { replace: true });

  try {
    const mod = await match.loader();
    if (token !== renderToken) return;
    document.title = APP_NAME;
    cleanup = (await mod.mount(root, ...match.params)) ?? null;
  } catch (err) {
    console.error(err);
    root.append(h('div', { class: 'share' }, h('h1', {}, 'Something went wrong'), h('p', { class: 'muted' }, err.message), link('/', { class: 'btn' }, 'Back to start')));
  }
}

window.addEventListener('popstate', render);
window.addEventListener('auth:expired', () => {
  if (!state.user) return;
  session.clear();
  toast('Your session expired. Please sign in again.', 'error');
  navigate('/login', { replace: true });
});
window.addEventListener('auth:must-change', () => navigate('/login', { replace: true }));

registerServiceWorker();

window.addEventListener('DOMContentLoaded', () => {
  // Tone.js loads with `defer` before this module runs, but guard anyway.
  render();
});
if (document.readyState !== 'loading') render();
