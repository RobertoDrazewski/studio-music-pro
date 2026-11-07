import { api } from '../api.js';
import { h, clear, toast, debounce, modal } from '../dom.js';
import { Editor } from '../editor.js';
import { Player, createScope, createTransport } from '../player.js';
import { DEMO_SONG } from '/shared/lang/demo.js';
import { exportStem } from '../export.js';
import { openShare as openShare0 } from './studio-share.js';
import { openExport as openExport0 } from './studio-export.js';
import { STYLES, STYLE_BY_ID } from '/shared/lang/styles.js';
import { openManual } from '../manual.js';
import { insertLineInSection } from '/shared/lang/edit.js';
import { createInstallButton } from '../install.js';
import { icon } from '../icons.js';
import { createUserMenu } from '../usermenu.js';
import { createPromptPanel } from '../promptpanel.js';
import { createVoicesPanel } from '../voices.js';
import { makeEdit, createTempoBar, createMixer, createPatternEditor } from '../controls.js';
import { session, navigate, link, brand } from '../main.js';

const MIX_PROMPT = 'Rebalance the mix only: set sensible volume, pan, reverb and filter on each instrument so it sounds clear, punchy and wide. Do not change notes, patterns, sections or tempo.';

const STARTER = `// New song. Press play, then edit while it runs.
bpm 120
key a minor

section intro 4
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."

section main 8
  kick "x . . . x . . . x . . . x . . ."
  hat ". . x . . . x . . . x . . . x ."
  bass "a1 . a1 . c2 . e1 ." saw lowpass 400 sidechain kick
`;


export async function mount(root, projectId) {
  const user = session.user;
  const locked = user.limits?.canDownload === false;
  const lockedModal = () => modal({ title: 'Downloads are not in the demo', body: h('div', { class: 'pf' }, h('p', {}, 'The demo lets you make one song and play it here. Downloading tracks, the full song or the Reaper project comes with a paid plan.'), h('p', { class: 'muted' }, 'Paid plans are available at launch.')), actions: [h('a', { class: 'btn primary', href: '/#plans' }, 'See plans')] });
  let projects = (await api.projects()).projects;
  let project = null;

  // Abro el proyecto pedido, o el más reciente, o creo el primero.
  if (projectId) {
    try {
      project = (await api.project(projectId)).project;
    } catch {
      toast('Project not found', 'error');
      return navigate('/studio', { replace: true });
    }
  } else if (projects.length) {
    return navigate(`/studio/${projects[0].id}`, { replace: true });
  } else {
    project = (await api.createProject('My first song', STARTER)).project;
    return navigate(`/studio/${project.id}`, { replace: true });
  }

  // ---------- editor y reproductor ----------
  const diag = h('div', { class: 'diag' });
  const saveState = h('span', { class: 'save-state' }, 'Saved');
  let saving = 0;
  const persist = debounce(async (patch) => {
    const ticket = ++saving;
    saveState.textContent = 'Saving…';
    try {
      await api.saveProject(project.id, patch);
      if (ticket === saving) saveState.textContent = 'Saved';
    } catch (e) {
      saveState.textContent = 'Not saved';
      toast(e.message, 'error');
    }
  }, 1200);

  const editor = new Editor({
    value: project.code,
    onChange: (code) => {
      project.code = code;
      saveState.textContent = 'Unsaved changes';
      persist({ title: title.value.trim() || 'Untitled', code });
      liveSync();
    },
  });
  const player = new Player(editor);
  const liveSync = debounce(() => player.sync(), 120);
  player.sync();

  const renderDiag = (result) => {
    const rows = [
      ...result.errors.map((e) => h('div', { class: 'e' }, e.line ? `line ${e.line}: ${e.message}` : e.message)),
      ...result.warnings.map((e) => h('div', { class: 'w' }, e.line ? `line ${e.line}: ${e.message}` : e.message)),
    ];
    const playing = player.playing && result.errors.length ? [h('div', { class: 'w' }, 'Still playing the last valid version.')] : [];
    diag.replaceChildren(...(rows.length ? [...rows.slice(0, 6), ...playing] : [h('span', { class: 'ok' }, `● valid · ${player.instruments.length} instruments`)]));
  };
  renderDiag(player.result);

  const scope = createScope(player);
  const transport = createTransport(player);

  // ---------- controles visuales (todos reescriben el código) ----------
  const edit = makeEdit(editor);
  const patternEditor = createPatternEditor({ player, edit, editor });
  // Insignias de la barra inferior: número de voces por generar y punto de la IA trabajando.
  const badges = {}, counts = {};
  const setBadge = (id, n) => { counts[id] = n; if (badges[id]) { badges[id].textContent = n > 1 ? String(n) : ''; badges[id].hidden = !n; } };
  // Barra de progreso global: se ve en todas las pestañas mientras la IA trabaja.
  // La IA no avisa cuánto falta, así que avanzo la barra de forma estimada (llega a ~92% y espera) y muestro los segundos.
  const actFill = h('i');
  const actText = h('span', {});
  // Botón para frenar: corta la espera en el navegador (el servidor puede terminar igual el pedido que ya mandé).
  let aiAbort = null;
  const cancelBtn = h('button', { class: 'btn small', type: 'button', onclick: () => aiAbort?.abort() }, 'Cancel');
  const activity = h('div', { class: 'activity', hidden: true, role: 'status' }, h('div', { class: 'act-track' }, actFill), h('div', { class: 'act-row' }, actText, cancelBtn));
  let actTimer = 0;
  const showActivity = (text) => {
    clearInterval(actTimer);
    activity.hidden = !text;
    setBadge('ai', text ? 1 : 0);
    if (!text) return;
    const t0 = Date.now();
    const draw = () => {
      const sec = (Date.now() - t0) / 1000;
      const pct = Math.min(92, (1 - Math.exp(-sec / 12)) * 100);
      actFill.style.width = `${pct.toFixed(0)}%`;
      actText.textContent = `${text} ${Math.round(pct)}% · ${Math.round(sec)} s`;
    };
    draw();
    actTimer = setInterval(draw, 250);
  };
  const mixerUi = createMixer({ mixWithAi: () => runAi('edit', MIX_PROMPT), player, edit, exportStem: (names, label) => locked ? lockedModal() : exportStem(player.ast, title.value || 'song', names, label, (m) => toast(m, 'info', 1500)).then(() => toast(`${label} downloaded`, 'ok', 1800)).catch((e) => toast(e.message, 'error')), openPattern: (i) => patternEditor.open(i) });
  const mixer = mixerUi.el;
  const tempoBar = createTempoBar({ player, edit });
  const voicesPanel = createVoicesPanel({ player, edit, editor, session, onPending: (n) => setBadge('voices', n) });
  player.on((e) => {
    if (e.type === 'parsed') renderDiag(e.result);
    if (e.type === 'state') renderDiag(player.result);
  });

  // ---------- título ----------
  const title = h('input', { class: 'title-input', value: project.title, maxlength: 100, 'aria-label': 'Song title' });
  title.addEventListener('input', () => {
    project.title = title.value;
    saveState.textContent = 'Unsaved changes';
    const t = title.value.trim();
    if (t) persist({ title: t, code: project.code });
  });

  // ---------- lista de canciones ----------
  const list = h('div', { class: 'proj-list' });
  const renderList = () => {
    clear(list);
    if (!projects.length) list.append(h('div', { class: 'empty' }, h('img', { src: '/img/empty-projects.jpg', alt: '' }), 'No songs yet'));
    for (const p of projects) {
      list.append(h('div', { class: `proj${p.id === project.id ? ' active' : ''}`, onclick: () => p.id !== project.id && goTo(p.id) },
        h('span', { class: 't' }, p.id === project.id ? title.value || p.title : p.title),
        h('button', { class: 'icon-btn', title: 'Delete', 'aria-label': `Delete ${p.title}`, onclick: (e) => { e.stopPropagation(); removeProject(p); } }, '🗑')));
    }
  };
  const goTo = async (id) => { await flush(); navigate(`/studio/${id}`); };
  const flush = async () => {
    persist.cancel();
    if (saveState.textContent !== 'Saved') {
      try { await api.saveProject(project.id, { title: title.value.trim() || 'Untitled', code: editor.value }); } catch { /* shown on next save */ }
    }
  };
  const newProject = async () => {
    await flush();
    if (user.limits?.maxProjects && projects.length >= user.limits.maxProjects) return modal({ title: 'The demo has one song', body: h('div', { class: 'pf' }, h('p', {}, 'Keep editing your song, or delete it to start another. More songs come with a paid plan, available at launch.')), actions: [h('a', { class: 'btn primary', href: '/#plans' }, 'See plans')] });
    if (projects.length >= 50) return toast('You reached the project limit', 'error');
    try {
      const { project: p } = await api.createProject('Untitled song', STARTER);
      navigate(`/studio/${p.id}`);
    } catch (e) { toast(e.message, 'error'); }
  };
  const removeProject = async (p) => {
    if (!confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteProject(p.id);
      projects = projects.filter((x) => x.id !== p.id);
      if (p.id === project.id) { persist.cancel(); navigate('/studio'); } else renderList();
    } catch (e) { toast(e.message, 'error'); }
  };

  // ---------- tipeo en vivo (demo y plantillas) ----------
  // Escribo un texto en el editor letra a letra y arranco a sonar apenas la canción ya es válida.
  let typingAbort = null;
  const typeSong = async (text, cps) => {
    typingAbort?.abort();
    const mine = (typingAbort = new AbortController());
    try {
      await window.Tone.start();
      await editor.typeIn(text, {
        cps, signal: mine.signal,
        onLine: (t) => {
          const r = player.sync(t.slice(0, t.lastIndexOf('\n') + 1));
          if (r.ok && player.playable && !player.playing && !mine.signal.aborted) player.play();
        },
      });
      editor.onChange?.(editor.value);
    } finally { if (typingAbort === mine) typingAbort = null; }
  };
  // Si ya hay algo escrito (que no sea el ejemplo inicial) pido confirmación antes de pisarlo.
  const confirmReplace = (msg) => !editor.value.trim() || editor.value.trim() === STARTER.trim() || confirm(msg);
  const typeDemo = () => confirmReplace('Replace the current code with the demo?') && typeSong(DEMO_SONG);

  // ---------- IA ----------
  const styleSel = h('select', { class: 'select', 'aria-label': 'Music style' },
    h('option', { value: 'auto' }, 'Style: auto-detect from my text'),
    STYLES.map((s) => h('option', { value: s.id }, `${s.name} (${s.bpm[0]}-${s.bpm[1]} bpm)`)));
  // Plantilla gratis: carga una canción de ejemplo del estilo elegido y le pone nombre.
  const loadTemplate = async () => {
    const style = STYLE_BY_ID[styleSel.value];
    if (!style) return toast('Pick a style first', 'error');
    if (!confirmReplace(`Replace the current code with the ${style.name} template?`)) return;
    await typeSong(style.example, 90);
    if (!/\b(template|reference)\b/.test(title.value)) { title.value = `${style.name} template`; title.dispatchEvent(new Event('input')); }
  };
  const aiPrompt = h('textarea', { class: 'textarea', maxlength: 600, placeholder: 'Write anything you want, in your own words. It is added to the clicks above.' });
  const promptPanel = createPromptPanel({
    freeText: aiPrompt,
    getStyleName: () => STYLE_BY_ID[styleSel.value]?.name ?? '',
    setStyle: (id) => { styleSel.value = id; },
    onApply: () => runAi('edit'),
  });
  styleSel.addEventListener('change', () => promptPanel.refresh());
  const aiNote = h('div', { class: 'muted', style: 'font-size:13px' });
  const aiBtnNew = h('button', { class: 'btn primary', type: 'button' }, '✨ New song');
  const aiBtnEdit = h('button', { class: 'btn', type: 'button' }, 'Edit current');
  const quotaText = () => {
    const q = session.quota?.ai;
    if (!q) return '';
    return q.limit === null ? 'AI requests: unlimited' : `AI requests this month: ${q.remaining} of ${q.limit} left`;
  };
  const refreshAiNote = () => { aiNote.textContent = quotaText(); };
  refreshAiNote();

  const runAi = async (mode, fixedPrompt) => {
    const prompt = (fixedPrompt ?? promptPanel.compose(mode)).trim();
    if (prompt.length < 3) return toast('Pick some options or write what you want first', 'error');
    if (mode === 'new' && editor.value.trim() && editor.value.trim() !== STARTER.trim() && !confirm('Replace the current song with a new one?')) return;
    aiBtnNew.disabled = aiBtnEdit.disabled = true;
    const old = aiNote.textContent;
    aiNote.textContent = 'Writing your song… (up to 30 seconds)';
    showActivity(fixedPrompt ? 'AI is mixing your song…' : 'AI is writing your song…');
    try {
      aiAbort = new AbortController();
      const res = await api.generate(prompt, mode === 'edit' ? editor.value : undefined, styleSel.value, aiAbort.signal);
      if (session.quota?.ai && res.quota) session.quota = { ...session.quota, ai: { ...session.quota.ai, remaining: res.quota.remaining } };
      if (player.playing) {
        editor.setValue(res.code); // entra en vivo en el compás siguiente
      } else {
        await window.Tone.start();
        await editor.typeIn(res.code, { cps: 160, onLine: (t) => player.sync(t.slice(0, t.lastIndexOf('\n') + 1)) });
        editor.onChange?.(editor.value);
      }
      if (mode === 'edit') promptPanel.clearEdits();
      if (res.tempoAdjusted) toast(`Tempo adjusted to fit ${STYLE_BY_ID[res.style]?.name ?? 'the style'}.`, 'info');
      if (res.warnings?.length) toast(`Generated with ${res.warnings.length} warning(s). Check the editor.`, 'info');
      else toast('Done. Press play to listen.', 'ok');
    } catch (e) {
      if (e.name === 'AbortError') toast('Cancelled. Your song was not changed.', 'info');
      else toast(e.message, 'error', 6500);
    } finally {
      aiBtnNew.disabled = aiBtnEdit.disabled = false;
      aiAbort = null;
      showActivity('');
      refreshAiNote();
      if (aiNote.textContent === 'Writing your song… (up to 30 seconds)') aiNote.textContent = old;
    }
  };
  aiBtnNew.addEventListener('click', () => runAi('new'));
  aiBtnEdit.addEventListener('click', () => runAi('edit'));
  aiPrompt.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runAi(editor.value.trim() ? 'edit' : 'new'); });

  // Compartir y exportar viven en sus propios archivos; acá solo los conecto con el estado de la canción.
  const projectCtx = { project: () => project, setProject: (p) => (project = { ...project, ...p }), flush: () => flush() };
  const openShare = () => openShare0(projectCtx);
  const openExport = () => openExport0({ locked, lockedModal, player, editor, title, flush });

  // ---------- referencia del lenguaje ----------
  const insertFromManual = (lines) => {
    const ast = player.result.ok ? player.result.ast : player.lastGood ?? player.result.ast;
    const sec = player.position?.section ?? ast.sections.at(-1)?.name ?? null;
    edit((c) => {
      // Las secciones y ajustes globales van al final de la canción; las líneas de instrumento, dentro de la sección actual.
      if (lines.some((l) => /^(section|bpm|key|swing|master|loop|mute|solo)\b/.test(l.trim()))) return `${c.trimEnd()}\n\n${lines.join('\n')}\n`;
      return lines.reduce((acc, l) => insertLineInSection(acc, sec, l), c);
    });
    toast('Added to your song', 'ok', 1800);
  };
  const reference = h('button', { class: 'btn manual-btn', type: 'button', onclick: () => openManual({ insert: insertFromManual }) }, icon('book', { size: 17 }), 'Open the full manual');

  // ---------- diseño de la pantalla ----------
  const userMenu = createUserMenu({ beforeLeave: flush });
  const topbar = h('header', { class: 'topbar' },
    link('/', { class: 'icon-btn home-btn', title: 'Back to the website', 'aria-label': 'Back to the website' }, icon('home', { size: 18 })),
    brand(), title, saveState, h('span', { class: 'spacer' }),
    session.mode === 'trial' ? h('span', { class: 'chip ok hide-sm', title: 'Invitation-only trial' }, 'beta') : null,
    h('button', { class: 'btn small hide-sm', onclick: typeDemo }, icon('terminal', { size: 14 }), ' Type the demo'),
    h('span', { class: 'hide-sm' }, createInstallButton()),
    h('button', { class: 'btn small', onclick: openShare }, icon('share', { size: 14 }), h('span', { class: 'hide-sm' }, ' Share')),
    h('button', { class: 'btn small primary', onclick: openExport }, icon('download', { size: 14 }), ' Export'),
    userMenu.el);

  const left = h('aside', { class: 'side left' },
    h('div', { class: 'pane', 'data-pane': 'songs' }, h('button', { class: 'btn', onclick: newProject }, '+ New song'), h('h3', {}, 'Your songs'), list),
    h('div', { class: 'pane', 'data-pane': 'mixer' }, h('h3', {}, 'Mixer'), mixer),
    h('div', { class: 'pane', 'data-pane': 'voices' }, h('h3', {}, 'Voices'), voicesPanel.el));
  const center = h('main', { class: 'center', 'data-pane': 'play' }, scope.el, transport.el, tempoBar.el,
    h('div', { class: 'term' }, h('div', { class: 'term-bar' }, h('i'), h('i'), h('i'), h('span', {}, 'song.pulse')), editor.el, diag), patternEditor.el);
  // Panel de IA en orden de uso: 1) plantilla, 2) editar la canción actual, 3) canción nueva. Todo desplegable.
  const acc = (title, open, ...kids) => h('details', { class: 'acc', open }, h('summary', {}, title), h('div', { class: 'acc-body' }, ...kids));
  const right = h('aside', { class: 'side right', 'data-pane': 'ai' }, h('h3', {}, 'AI assistant'),
    acc('1 · Start from a template', !editor.value.trim() || editor.value.trim() === STARTER.trim(), styleSel,
      h('button', { class: 'btn', type: 'button', title: 'Free: loads a ready-made song of the chosen style', onclick: loadTemplate }, 'Load template')),
    acc('2 · Edit current song', true, aiPrompt, promptPanel.el),
    acc('Or write a new song with AI', false, h('div', { class: 'row' }, aiBtnNew)), aiNote, reference);
  // Navegación inferior (celulares): un panel a la vez.
  const TABS = [['songs', 'music', 'Songs'], ['mixer', 'sliders', 'Mixer'], ['play', 'play', 'Play'], ['voices', 'mic', 'Voices'], ['ai', 'sparkles', 'AI']];
  const studio = h('div', { class: 'studio', 'data-tab': 'play' }, left, center, right);
  const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Studio sections' });
  const setTab = (id) => {
    studio.dataset.tab = id;
    for (const b of nav.children) b.setAttribute('aria-current', String(b.dataset.tab === id));
    studio.scrollTop = 0;
  };
  for (const [id, ic, label] of TABS) {
    nav.append(h('button', { type: 'button', 'data-tab': id, 'aria-current': String(id === 'play'), onclick: () => setTab(id) }, h('span', { class: 'bn-i', 'aria-hidden': 'true' }, icon(ic, { size: 21 }), (badges[id] = h('b', { class: 'badge', hidden: true }))), h('span', {}, label)));
  }
  for (const id in counts) setBadge(id, counts[id]);
  root.append(h('div', { class: 'studio-page' }, topbar, activity, studio, nav));
  renderList();
  title.addEventListener('input', renderList);

  const onKey = (e) => {
    if (e.code === 'Space' && e.ctrlKey) { e.preventDefault(); player.toggle(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); persist.cancel(); flush(); }
  };
  document.addEventListener('keydown', onKey);
  const onUnload = (e) => { if (saveState.textContent !== 'Saved') { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onUnload);

  return () => {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onUnload);
    typingAbort?.abort();
    flush();
    player.dispose();
    scope.stop();
    userMenu.dispose();
  };
}
