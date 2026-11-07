import { api } from '../api.js';
import { h, clear, toast, debounce, modal, copyText, download } from '../dom.js';
import { Editor } from '../editor.js';
import { Player, createScope, createTransport } from '../player.js';
import { DEMO_SONG } from '/shared/lang/demo.js';
import { LIMITS } from '/shared/lang/spec.js';
import { exportViaServer, exportWav, exportStem, exportStudioPack, estimatePackMb } from '../export.js';
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

  // Open the requested project, or the most recent one, or create the first one.
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

  // ---------- editor, player ----------
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

  // ---------- visual controls (all of them rewrite the code) ----------
  const edit = makeEdit(editor);
  const patternEditor = createPatternEditor({ player, edit, editor });
  // Insignias de la barra inferior: número de voces por generar y punto de la IA trabajando.
  const badges = {}, counts = {};
  const setBadge = (id, n) => { counts[id] = n; if (badges[id]) { badges[id].textContent = n > 1 ? String(n) : ''; badges[id].hidden = !n; } };
  // Barra de progreso global: se ve en todas las pestañas mientras la IA escribe.
  const activity = h('div', { class: 'activity', hidden: true, role: 'status' }, h('i'), h('span', {}));
  const showActivity = (text) => { activity.hidden = !text; activity.lastChild.textContent = text || ''; setBadge('ai', text ? 1 : 0); };
  const mixerUi = createMixer({ mixWithAi: () => runAi('edit', MIX_PROMPT),  player, edit, exportStem: (names, label) => locked ? lockedModal() : exportStem(player.ast, title.value || 'song', names, label, (m) => toast(m, 'info', 1500)).then(() => toast(`${label} downloaded`, 'ok', 1800)).catch((e) => toast(e.message, 'error')), openPattern: (i) => patternEditor.open(i) });
  const mixer = mixerUi.el;
  const tempoBar = createTempoBar({ player, edit });
  const voicesPanel = createVoicesPanel({ player, edit, editor, session, onPending: (n) => setBadge('voices', n) });
  player.on((e) => {
    if (e.type === 'parsed') renderDiag(e.result);
    if (e.type === 'state') renderDiag(player.result);
  });

  // ---------- title ----------
  const title = h('input', { class: 'title-input', value: project.title, maxlength: 100, 'aria-label': 'Song title' });
  title.addEventListener('input', () => {
    project.title = title.value;
    saveState.textContent = 'Unsaved changes';
    const t = title.value.trim();
    if (t) persist({ title: t, code: project.code });
  });

  // ---------- projects list ----------
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

  // ---------- demo typing ----------
  let typingAbort = null;
  const typeDemo = async () => {
    if (editor.value.trim() && editor.value.trim() !== STARTER.trim() && !confirm('Replace the current code with the demo?')) return;
    typingAbort?.abort();
    typingAbort = new AbortController();
    const mine = typingAbort;
    try {
      await window.Tone.start();
      await editor.typeIn(DEMO_SONG, {
        signal: mine.signal,
        onLine: (text) => {
          const r = player.sync(text.slice(0, text.lastIndexOf('\n') + 1));
          if (r.ok && player.playable && !player.playing && !mine.signal.aborted) player.play();
        },
      });
      editor.onChange?.(editor.value);
    } finally { if (typingAbort === mine) typingAbort = null; }
  };

  // ---------- AI ----------
  const styleSel = h('select', { class: 'select', 'aria-label': 'Music style' },
    h('option', { value: 'auto' }, 'Style: auto-detect from my text'),
    STYLES.map((s) => h('option', { value: s.id }, `${s.name} (${s.bpm[0]}-${s.bpm[1]} bpm)`)));
  const loadTemplate = async () => {
    const style = STYLE_BY_ID[styleSel.value];
    if (!style) return toast('Pick a style first', 'error');
    if (editor.value.trim() && editor.value.trim() !== STARTER.trim() && !confirm(`Replace the current code with the ${style.name} template?`)) return;
    typingAbort?.abort();
    typingAbort = new AbortController();
    const mine = typingAbort;
    try {
      await window.Tone.start();
      await editor.typeIn(style.example, {
        cps: 90, signal: mine.signal,
        onLine: (text) => {
          const r = player.sync(text.slice(0, text.lastIndexOf('\n') + 1));
          if (r.ok && player.playable && !player.playing && !mine.signal.aborted) player.play();
        },
      });
      editor.onChange?.(editor.value);
      if (!/\b(template|reference)\b/.test(title.value)) { title.value = `${style.name} template`; title.dispatchEvent(new Event('input')); }
    } finally { if (typingAbort === mine) typingAbort = null; }
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
      const res = await api.generate(prompt, mode === 'edit' ? editor.value : undefined, styleSel.value);
      if (session.quota?.ai && res.quota) session.quota = { ...session.quota, ai: { ...session.quota.ai, remaining: res.quota.remaining } };
      if (player.playing) {
        editor.setValue(res.code); // goes live on the next bar
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
      toast(e.message, 'error', 6500);
    } finally {
      aiBtnNew.disabled = aiBtnEdit.disabled = false;
      showActivity('');
      refreshAiNote();
      if (aiNote.textContent === 'Writing your song… (up to 30 seconds)') aiNote.textContent = old;
    }
  };
  aiBtnNew.addEventListener('click', () => runAi('new'));
  aiBtnEdit.addEventListener('click', () => runAi('edit'));
  aiPrompt.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runAi(editor.value.trim() ? 'edit' : 'new'); });

  // ---------- share ----------
  const openShare = async () => {
    const show = (p) => {
      const url = `${location.origin}/s/${p.shareSlug}`;
      const input = h('input', { class: 'input mono', readonly: true, value: url, onfocus: (e) => e.target.select() });
      const body = p.shared
        ? h('div', {}, h('p', { class: 'muted', style: 'margin-bottom:10px' }, 'Anyone with this link can listen and play with a copy of the code. Your edits after sharing are visible too.'), input)
        : h('p', { class: 'muted' }, 'Sharing is off. Turn it on to get a public link to this song.');
      dlg.setBody(body);
      dlg.setActions(p.shared
        ? [h('button', { class: 'btn danger', onclick: async () => { project = { ...project, ...(await api.shareProject(project.id, false)).project }; show(project); } }, 'Stop sharing'),
           h('button', { class: 'btn primary', onclick: () => copyText(url) }, 'Copy link')]
        : [h('button', { class: 'btn primary', onclick: async () => { await flush(); project = { ...project, ...(await api.shareProject(project.id, true)).project }; show(project); } }, 'Create public link')]);
    };
    const bodyEl = h('div');
    const actionsEl = h('div', { class: 'modal-actions', style: 'padding:0' });
    const m = modal({ title: 'Share this song', body: [bodyEl, h('div', { style: 'margin-top:16px' }, actionsEl)] });
    const dlg = {
      setBody: (b) => bodyEl.replaceChildren(b),
      setActions: (a) => actionsEl.replaceChildren(...a),
    };
    void m;
    show(project);
  };

  // ---------- export / master ----------
  const openExport = async () => {
    if (locked) return lockedModal();
    if (!player.playable) return toast('Fix the errors (or add a section) before exporting', 'error');
    await flush();
    let presets = [];
    try { presets = (await api.presets()).presets; } catch { /* handled by empty list */ }
    const preset = h('select', { class: 'select' }, presets.map((p) => h('option', { value: p.id }, `${p.id}: ${p.description}`)));
    const lufs = h('input', { class: 'input', type: 'number', min: -23, max: -6, step: 0.5, placeholder: 'Preset default' });
    const nameInput = h('input', { class: 'input', value: title.value || 'song', maxlength: 100 });
    const mq = session.quota?.master;
    const mqText = mq ? (mq.limit === null ? 'Masters today: unlimited' : `Masters today: ${mq.remaining} of ${mq.limit} left`) : '';
    const packMode = h('select', { class: 'select' },
      h('option', { value: 'instrument' }, 'Each instrument (kick, bass, pad, lead, voices…)'),
      h('option', { value: 'group' }, 'Groups (percussion, bass, mids, lead, voices)'),
      h('option', { value: 'both' }, 'Both: instruments and groups'));
    const packBits = h('select', { class: 'select' }, h('option', { value: '24' }, '24-bit'), h('option', { value: '16' }, '16-bit (smaller)'));
    const packRpp = h('input', { type: 'checkbox', checked: true });
    const packNote = h('p', { class: 'muted', style: 'font-size:12px' });
    const updatePackNote = () => {
      const mb = estimatePackMb(player.ast, packMode.value, Number(packBits.value));
      packNote.textContent = `About ${mb} MB. Every file has the same length and starts at 0, so they line up in any DAW.${mb > 600 ? ' Large: try 16-bit or groups.' : ''}`;
    };
    packMode.addEventListener('change', updatePackNote); packBits.addEventListener('change', updatePackNote); updatePackNote();
    const stage = h('div');
    const form = h('div', {},
      h('img', { class: 'stage-img', src: '/img/master-processing-wide.jpg', alt: '' }),
      h('div', { class: 'field' }, h('label', {}, 'File name'), nameInput),
      h('div', { class: 'row' }, h('div', { class: 'field', style: 'flex:2;min-width:200px' }, h('label', {}, 'Mastering preset'), preset),
        h('div', { class: 'field', style: 'flex:1;min-width:120px' }, h('label', {}, 'Target LUFS'), lufs)),
      h('div', { class: 'pack-box' },
        h('h4', {}, 'Studio pack for Reaper (free, made in your browser)'),
        h('div', { class: 'row' },
          h('div', { class: 'field', style: 'flex:2;min-width:180px' }, h('label', {}, 'Separate files'), packMode),
          h('div', { class: 'field', style: 'flex:1;min-width:110px' }, h('label', {}, 'Bit depth'), packBits)),
        h('label', { class: 'check' }, packRpp, ' Include a Reaper project (project.rpp)'),
        packNote),
      h('p', { class: 'muted', style: 'font-size:13px' }, `${mqText}${mqText ? ' · ' : ''}The mix and each instrument are rendered in your browser, so a long song can take a minute.`),
      stage);
    let running = null;
    const m = modal({ title: 'Export', body: form, wide: true, onClose: () => running?.abort() });

    const setStage = (text, pct) => {
      stage.replaceChildren(h('p', { class: 'mono', style: 'margin-top:12px' }, text), h('div', { class: 'big-bar' }, h('i', { style: `width:${Math.round((pct ?? 0) * 100)}%` })));
    };
    const buttons = [];
    const lock = (v) => buttons.forEach((b) => (b.disabled = v));
    const run = async (kind) => {
      running = new AbortController();
      lock(true);
      try {
        const t = nameInput.value.trim() || 'song';
        if (kind === 'pack') {
          let pct = 0;
          const res = await exportStudioPack({
            ast: player.ast, code: editor.value, title: t, mode: packMode.value, bits: Number(packBits.value), rpp: packRpp.checked,
            onStatus: (s) => setStage(s, pct), onProgress: (p) => { pct = p * 0.9; },
          });
          stage.replaceChildren(h('p', { class: 'mono' }, `✓ Studio pack downloaded (${res.files} files, ${Math.round(res.bytes / 1e6)} MB)`));
        } else if (kind === 'wav') {
          setStage('Rendering…', 0.4);
          await exportWav(player.ast, t, (s) => setStage(s, 0.4));
          stage.replaceChildren(h('p', { class: 'mono' }, '✓ WAV downloaded'));
        } else {
          let pct = 0;
          const res = await exportViaServer({
            ast: player.ast, code: editor.value, title: t, kind, preset: preset.value,
            targetLufs: lufs.value ? Number(lufs.value) : undefined, signal: running.signal,
            onStatus: (s) => setStage(s, pct), onProgress: (p) => { pct = p * 0.7; },
          });
          setStage('Downloading…', 1);
          const r = await fetch(res.url, { credentials: 'same-origin' });
          if (!r.ok) throw new Error('Download failed');
          download(await r.blob(), res.filename);
          const metrics = res.job.metrics;
          stage.replaceChildren(
            h('img', { class: 'stage-img', src: '/img/master-result-wide.jpg', alt: '' }),
            h('p', { class: 'mono' }, '✓ Done. Your download has started.'),
            metrics?.outputLufs !== undefined ? h('p', { class: 'muted mono', style: 'font-size:13px' }, `Loudness ${metrics.outputLufs} LUFS · true peak ${metrics.outputTruePeakDb} dBTP`) : null);
          const me = await api.me().catch(() => null);
          if (me) session.quota = me.quota;
        }
      } catch (e) {
        stage.replaceChildren(h('p', { class: 'error-text' }, e.message));
      } finally { lock(false); running = null; }
    };
    const bMaster = h('button', { class: 'btn primary', onclick: () => run('master') }, 'Master + stems (ZIP)');
    const bMp3 = h('button', { class: 'btn', onclick: () => run('mp3') }, 'MP3 of the mix');
    const bWav = h('button', { class: 'btn', onclick: () => run('wav') }, 'WAV of the mix');
    const bPack = h('button', { class: 'btn primary', onclick: () => run('pack') }, 'Studio pack for Reaper (ZIP)');
    buttons.push(bMaster, bMp3, bWav, bPack);
    m.el.querySelector('.modal').append(h('div', { class: 'modal-actions' }, bWav, bMp3, bMaster, bPack));
  };

  // ---------- language reference ----------
  const insertFromManual = (lines) => {
    const ast = player.result.ok ? player.result.ast : player.lastGood ?? player.result.ast;
    const sec = player.position?.section ?? ast.sections.at(-1)?.name ?? null;
    edit((c) => {
      // Whole sections / globals go at the end of the song; instrument lines go inside the current section.
      if (lines.some((l) => /^(section|bpm|key|swing|master|loop|mute|solo)\b/.test(l.trim()))) return `${c.trimEnd()}\n\n${lines.join('\n')}\n`;
      return lines.reduce((acc, l) => insertLineInSection(acc, sec, l), c);
    });
    toast('Added to your song', 'ok', 1800);
  };
  const reference = h('button', { class: 'btn manual-btn', type: 'button', onclick: () => openManual({ insert: insertFromManual }) }, icon('book', { size: 17 }), 'Open the full manual');

  // ---------- layout ----------
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
  // Bottom navigation (phones): one panel at a time.
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
