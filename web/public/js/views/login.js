import { api } from '../api.js';
import { h, clear } from '../dom.js';
import { session, navigate, brand } from '../main.js';
import { APP_NAME } from '../config.js';

export function mount(root) {
  const card = h('div', { class: 'auth-card' });
  root.append(h('main', { class: 'auth' }, card));

  const loginForm = () => {
    const err = h('div', { class: 'error-text', role: 'alert' });
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, placeholder: 'you@example.com' });
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
    const btn = h('button', { class: 'btn primary big', type: 'submit', style: 'width:100%' }, 'Sign in');
    const form = h('form', {}, h('div', { class: 'field' }, h('label', {}, 'Email'), email), h('div', { class: 'field' }, h('label', {}, 'Password'), pass), err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      try {
        await api.login(email.value, pass.value);
        await session.refresh();
        if (session.user.mustChangePassword) return showChange(pass.value);
        navigate('/studio');
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
    clear(card).append(
      h('div', { class: 'brand' }, h('img', { src: '/img/logo-mark.jpg', alt: '', width: 32, height: 32 }), APP_NAME),
      h('h1', {}, 'Sign in'),
      h('p', { class: 'muted' }, session.mode === 'trial' ? 'Access is by invitation during the trial.' : 'Welcome back.'),
      form,
    );
    email.focus();
  };

  const showChange = (currentPassword = '') => {
    const err = h('div', { class: 'error-text', role: 'alert' });
    const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, value: currentPassword });
    const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 });
    const p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: 10 });
    const btn = h('button', { class: 'btn primary big', type: 'submit', style: 'width:100%' }, 'Save and continue');
    const form = h('form', {},
      h('div', { class: 'field' }, h('label', {}, 'Temporary password'), cur),
      h('div', { class: 'field' }, h('label', {}, 'New password (at least 10 characters)'), p1),
      h('div', { class: 'field' }, h('label', {}, 'Repeat new password'), p2), err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (p1.value !== p2.value) return (err.textContent = 'The passwords do not match');
      btn.disabled = true;
      try {
        await api.changePassword(cur.value, p1.value);
        await session.refresh();
        navigate('/studio');
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
    clear(card).append(
      h('div', { class: 'brand' }, h('img', { src: '/img/logo-mark.jpg', alt: '', width: 32, height: 32 }), APP_NAME),
      h('h1', {}, 'Choose your password'),
      h('p', { class: 'muted' }, 'You signed in with a temporary password. Set your own to continue.'),
      form,
    );
    (currentPassword ? p1 : cur).focus();
  };

  (async () => {
    if (!session.user) await session.refresh();
    if (session.user?.mustChangePassword) showChange();
    else if (session.user) navigate('/studio', { replace: true });
    else loginForm();
  })();
  void brand;
}
