import { api } from '../api.js';
import { h, clear, toast, modal, copyText, fmtDate } from '../dom.js';
import { session, link, brand, navigate } from '../main.js';

const money = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const quotaText = (q) => (q.limit === null ? `${q.used} / ∞` : `${q.used} / ${q.limit}`);

export async function mount(root) {
  const stats = h('div', { class: 'stats' });
  const tableBox = h('div', { class: 'table-wrap' });
  let users = [];

  async function load() {
    const [u, usage] = await Promise.all([api.adminUsers(), api.adminUsage()]);
    users = u.users;
    const done = usage.jobs.find((j) => j.status === 'done')?.n ?? 0;
    const b = usage.budget;
    clear(stats).append(
      stat(String(users.length), 'Users'),
      stat(`${money(b.spentUsd ?? b.spent ?? 0)} / ${money(b.capUsd ?? b.cap ?? 0)}`, 'AI spend this month'),
      stat(String(done), 'Masters this month'),
      stat(usage.model, `Model · ${usage.mode} mode`));
    renderTable(usage);
  }
  const stat = (value, label) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label));

  function secretModal(title, email, password) {
    modal({ title, body: [
      h('p', { class: 'muted', style: 'margin-bottom:12px' }, `Send this temporary password to ${email}. It is shown only once; they will be asked to choose their own at first sign-in.`),
      h('div', { class: 'secret' }, password),
    ], actions: [h('button', { class: 'btn primary', onclick: () => copyText(password) }, 'Copy password')] });
  }

  function createUserModal() {
    const name = h('input', { class: 'input', required: true, maxlength: 80 });
    const email = h('input', { class: 'input', type: 'email', required: true });
    const ai = h('input', { class: 'input', type: 'number', min: 0, value: 30 });
    const mst = h('input', { class: 'input', type: 'number', min: 0, value: 3 });
    const vq = h('input', { class: 'input', type: 'number', min: 0, value: 10 });
    const plan = h('input', { class: 'input', value: 'trial', maxlength: 30 });
    const err = h('div', { class: 'error-text' });
    const m = modal({ title: 'New access', body: h('div', {},
      h('div', { class: 'field' }, h('label', {}, 'Name'), name), h('div', { class: 'field' }, h('label', {}, 'Email'), email),
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:1' }, h('label', {}, 'AI requests / month'), ai), h('div', { class: 'field', style: 'flex:1' }, h('label', {}, 'Masters / day'), mst), h('div', { class: 'field', style: 'flex:1' }, h('label', {}, 'AI voices / month'), vq)),
      h('div', { class: 'field' }, h('label', {}, 'Plan'), plan), err),
    actions: [h('button', { class: 'btn primary', onclick: async (e) => {
      err.textContent = '';
      if (!name.value.trim() || !email.value.trim()) return (err.textContent = 'Name and email are required');
      e.target.disabled = true;
      try {
        const r = await api.adminCreateUser({ name: name.value.trim(), email: email.value.trim(), aiMonthlyQuota: Number(ai.value), masterDailyQuota: Number(mst.value), voiceMonthlyQuota: Number(vq.value), plan: plan.value.trim() || 'trial' });
        m.close();
        await load();
        secretModal('Access created', r.user.email, r.temporaryPassword);
      } catch (ex) { err.textContent = ex.message; e.target.disabled = false; }
    } }, 'Create access')] });
    name.focus();
  }

  function editUserModal(u) {
    const ai = h('input', { class: 'input', type: 'number', min: 0, value: u.aiMonthlyQuota });
    const mst = h('input', { class: 'input', type: 'number', min: 0, value: u.masterDailyQuota });
    const vq = h('input', { class: 'input', type: 'number', min: 0, value: u.voiceMonthlyQuota });
    const plan = h('input', { class: 'input', value: u.plan, maxlength: 30 });
    const err = h('div', { class: 'error-text' });
    const m = modal({ title: u.email, body: h('div', {},
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:1' }, h('label', {}, 'AI requests / month'), ai), h('div', { class: 'field', style: 'flex:1' }, h('label', {}, 'Masters / day'), mst), h('div', { class: 'field', style: 'flex:1' }, h('label', {}, 'AI voices / month'), vq)),
      h('div', { class: 'field' }, h('label', {}, 'Plan'), plan), err),
    actions: [h('button', { class: 'btn primary', onclick: async () => {
      try {
        await api.adminUpdateUser(u.id, { aiMonthlyQuota: Number(ai.value), masterDailyQuota: Number(mst.value), voiceMonthlyQuota: Number(vq.value), plan: plan.value.trim() || u.plan });
        m.close(); toast('Saved', 'ok'); load();
      } catch (ex) { err.textContent = ex.message; }
    } }, 'Save')] });
  }

  function renderTable(usage) {
    const costs = new Map(usage.users.map((x) => [x.id, x]));
    const rows = users.map((u) => h('tr', {},
      h('td', {}, h('b', {}, u.name), h('div', { class: 'muted', style: 'font-size:12px' }, u.email)),
      h('td', {}, u.role === 'superadmin' ? h('span', { class: 'chip' }, 'admin') : h('span', { class: `chip ${u.active ? 'ok' : 'off'}` }, u.active ? u.plan : 'disabled')),
      h('td', { class: 'mono' }, quotaText(u.usage.ai)), h('td', { class: 'mono' }, quotaText(u.usage.voice)), h('td', { class: 'mono' }, quotaText(u.usage.master)),
      h('td', { class: 'mono' }, money(costs.get(u.id)?.costUsd)), h('td', {}, u.usage.projects), h('td', {}, fmtDate(u.lastLoginAt)),
      h('td', {}, u.role === 'superadmin' ? null : h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => editUserModal(u) }, 'Edit'),
        h('button', { class: 'btn small', onclick: async () => {
          if (!confirm(`Generate a new temporary password for ${u.email}? They will be signed out.`)) return;
          try { const r = await api.adminResetPassword(u.id); secretModal('New temporary password', u.email, r.temporaryPassword); } catch (ex) { toast(ex.message, 'error'); }
        } }, 'Reset password'),
        h('button', { class: `btn small ${u.active ? 'danger' : ''}`, onclick: async () => {
          try { await api.adminUpdateUser(u.id, { active: !u.active }); load(); } catch (ex) { toast(ex.message, 'error'); }
        } }, u.active ? 'Disable' : 'Enable')))));
    clear(tableBox).append(h('table', {},
      h('thead', {}, h('tr', {}, ['User', 'Status', 'AI (month)', 'Voices (month)', 'Masters (today)', 'AI cost', 'Songs', 'Last sign-in', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows)));
  }

  root.append(
    h('header', { class: 'nav' }, brand(), h('span', { class: 'spacer' }), link('/studio', { class: 'btn small' }, 'Studio'),
      h('button', { class: 'btn small ghost', onclick: async () => { await api.logout().catch(() => {}); session.clear(); navigate('/'); } }, 'Sign out')),
    h('main', { class: 'admin' },
      h('div', { class: 'admin-hero' }, h('h1', {}, 'Administration')),
      stats,
      h('div', { class: 'row', style: 'margin-bottom:12px' }, h('h2', { style: 'font-size:20px' }, 'Accesses'), h('span', { class: 'spacer' }),
        h('button', { class: 'btn primary', onclick: createUserModal }, '+ New access')),
      tableBox));
  await load();
}
