// User menu (avatar + dropdown) and the profile dialog: photo, name, password, language.
import { api } from './api.js';
import { h, modal, toast } from './dom.js';
import { icon } from './icons.js';
import { avatarEl, langSwitch } from './components.js';
import { session, navigate, link } from './main.js';

// Resizes a picture to a small square in the browser, so the server only stores a few KB.
async function toAvatar(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP image');
  const bmp = await createImageBitmap(file);
  const size = 192;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = canvas.getContext('2d');
  const side = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  let q = 0.86;
  let data = canvas.toDataURL('image/webp', q);
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', q);
  while (data.length > 55_000 && q > 0.3) { q -= 0.1; data = canvas.toDataURL(data.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', q); }
  if (data.length > 55_000) throw new Error('The picture is too large. Try a smaller one.');
  return data;
}

export function openProfile({ onChange = () => {} } = {}) {
  const user = session.user;
  let avatar = user.avatar ?? null;
  const preview = h('div', { class: 'pf-avatar' });
  const drawPreview = () => preview.replaceChildren(avatarEl({ ...user, avatar }, 84));
  drawPreview();
  const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try { avatar = await toAvatar(f); drawPreview(); } catch (e) { toast(e.message, 'error'); }
    file.value = '';
  });
  const name = h('input', { class: 'input', value: user.name, maxlength: 80, autocomplete: 'name' });
  const err = h('div', { class: 'error-text', role: 'alert' });

  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
  const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 10 });
  const p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 10 });
  const pwErr = h('div', { class: 'error-text', role: 'alert' });
  const pwBtn = h('button', { class: 'btn', type: 'button' }, icon('key', { size: 15 }), ' Change password');
  pwBtn.addEventListener('click', async () => {
    pwErr.textContent = '';
    if (!cur.value || !p1.value) return (pwErr.textContent = 'Fill in your current and new password');
    if (p1.value !== p2.value) return (pwErr.textContent = 'The passwords do not match');
    pwBtn.disabled = true;
    try {
      await api.changePassword(cur.value, p1.value);
      cur.value = p1.value = p2.value = '';
      toast('Password updated', 'ok');
    } catch (e) { pwErr.textContent = e.message; } finally { pwBtn.disabled = false; }
  });

  const save = h('button', { class: 'btn primary', type: 'button' }, 'Save profile');
  const m = modal({
    title: 'Your profile',
    body: h('div', { class: 'pf' },
      h('div', { class: 'pf-top' }, preview,
        h('div', { class: 'pf-pic' },
          h('div', { class: 'row' },
            h('button', { class: 'btn small', type: 'button', onclick: () => file.click() }, icon('camera', { size: 14 }), ' Change photo'),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => { avatar = null; drawPreview(); } }, 'Remove')),
          h('p', { class: 'muted' }, 'PNG, JPEG or WebP. It is resized on your device.'), file)),
      h('div', { class: 'field' }, h('label', {}, 'Name'), name),
      h('div', { class: 'field' }, h('label', {}, 'Email'), h('input', { class: 'input', value: user.email, disabled: true, 'data-notranslate': '' })),
      h('div', { class: 'row' }, h('span', { class: 'chip' }, `Plan: ${user.plan}`), h('span', { class: 'spacer' }), langSwitch()),
      err,
      h('div', { class: 'pf-sep' }, h('h3', {}, 'Password')),
      h('div', { class: 'field' }, h('label', {}, 'Current password'), cur),
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:1;min-width:160px' }, h('label', {}, 'New password (at least 10 characters)'), p1),
        h('div', { class: 'field', style: 'flex:1;min-width:160px' }, h('label', {}, 'Repeat new password'), p2)),
      pwErr, pwBtn),
    actions: [save],
  });
  save.addEventListener('click', async () => {
    err.textContent = '';
    if (!name.value.trim()) return (err.textContent = 'Enter a name');
    save.disabled = true;
    try {
      const r = await api.updateProfile({ name: name.value.trim(), avatar });
      session.setUser({ ...session.user, ...r.user });
      onChange(r.user);
      toast('Profile saved', 'ok', 2000);
      m.close();
    } catch (e) { err.textContent = e.message; save.disabled = false; }
  });
}

// Avatar button with a dropdown: profile, back to the website, admin, sign out.
export function createUserMenu({ beforeLeave = async () => {} } = {}) {
  const user = () => session.user;
  const wrap = h('div', { class: 'umenu' });
  const btn = h('button', { class: 'umenu-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Account menu' });
  const pop = h('div', { class: 'umenu-pop', role: 'menu', hidden: true });
  wrap.append(btn, pop);

  const close = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  const item = (ic, text, fn, extra = {}) => h('button', { class: 'umenu-item', role: 'menuitem', type: 'button', onclick: async () => { close(); await fn(); }, ...extra }, icon(ic, { size: 16 }), h('span', {}, text));
  const paint = () => {
    const u = user();
    btn.replaceChildren(avatarEl(u, 30), icon('chevronDown', { size: 14 }));
    pop.replaceChildren(
      h('div', { class: 'umenu-head' }, avatarEl(u, 40), h('div', {}, h('b', { 'data-notranslate': '' }, u.name), h('span', { 'data-notranslate': '' }, u.email))),
      item('user', 'Profile and password', () => openProfile({ onChange: paint })),
      link('/', { class: 'umenu-item', role: 'menuitem', onclick: null }, icon('home', { size: 16 }), h('span', {}, 'Back to the website')),
      u.role === 'superadmin' ? link('/admin', { class: 'umenu-item', role: 'menuitem' }, icon('shield', { size: 16 }), h('span', {}, 'Administration')) : null,
      h('div', { class: 'umenu-lang' }, h('span', {}, 'Language'), langSwitch()),
      item('logout', 'Sign out', async () => { await beforeLeave(); await api.logout().catch(() => {}); session.clear(); navigate('/'); }, { class: 'umenu-item danger' }));
  };
  paint();
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = pop.hidden;
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('click', onDoc);
  document.addEventListener('keydown', onKey);
  pop.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  return { el: wrap, dispose: () => { document.removeEventListener('click', onDoc); document.removeEventListener('keydown', onKey); } };
}
