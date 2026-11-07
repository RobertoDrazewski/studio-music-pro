import { createInstallButton } from '../install.js';
import { h } from '../dom.js';
import { Editor } from '../editor.js';
import { Player, createScope } from '../player.js';
import { DEMO_SONG } from '/shared/lang/demo.js';
import { session, link, brand } from '../main.js';
import { icon } from '../icons.js';
import { langSwitch, siteFooter } from '../components.js';

const TABS = [
  ['demo', 'play', 'Demo'],
  ['features', 'sparkles', 'Features'],
  ['sounds', 'speaker', 'Sounds'],
  ['plans', 'crown', 'Plans'],
];

const FEATURES = [
  ['code', 'Edit while it plays', 'Change a line and the next bar already sounds different. A wrong note gets highlighted; the music keeps going.'],
  ['sparkles', 'AI drafts the first idea', 'Describe the track you want. You get plain, editable code back, not a locked audio file.'],
  ['wand', 'Build it with clicks', 'Style, mood, instruments and quick edits are buttons. Every click rewrites the code for you.'],
  ['mic', 'Your voice or an AI voice', 'Add spoken lines with AI voices, or record yourself over the song right in the browser.'],
  ['layers', 'Every track, plus a Reaper project', 'Download each instrument or group as WAV, or one ZIP with the mix, all the tracks and a ready .rpp project.'],
  ['gauge', 'Mastered in one click', 'Loudness and tone are balanced for you. Export WAV, MP3 or a mastered ZIP.'],
];

const SOUND_GROUPS = [
  ['drum', 'Percussion', 'Drums and rhythm', ['kick', 'snare', 'clap', 'hat', 'openhat', 'perc']],
  ['speaker', 'Bass', 'The low end', ['bass', 'sub']],
  ['keys', 'Mids', 'Chords and texture', ['pad', 'strings', 'organ', 'keys', 'stab', 'pluck', 'arp']],
  ['zap', 'Lead', 'Melodies', ['lead', 'synth', 'bell']],
  ['mic', 'Voices', 'Spoken and recorded', ['voice']],
];

const PLANS = [
  { id: 'free', name: 'Free', icon: 'music', month: 0, year: 0, blurb: 'Try the studio with one song, no card needed.',
    items: ['1 song to try the studio', 'Live editor, manual and click builder', 'Play it in the browser', 'Downloads are not included'] },
  { id: 'creator', name: 'Creator', icon: 'zap', month: 9, year: 90, popular: true, blurb: 'For musicians who release and mix every week.',
    items: ['Everything in Free', 'Unlimited songs', 'Download the full song or each track', 'Reaper project export', '40 AI songs per month', '20 AI voice clips per month', '10 masters per day'] },
  { id: 'studio', name: 'Studio', icon: 'crown', month: 19, year: 190, blurb: 'For producers and bands working every day.',
    items: ['Everything in Creator', '150 AI songs per month', '100 AI voice clips per month', '25 masters per day'] },
];

export function mount(root) {
  const loggedIn = !!session.user;
  const cta = (cls = 'btn primary') => (loggedIn ? link('/studio', { class: cls }, 'Open studio') : link('/login', { class: cls }, 'Sign in'));

  // ---------- encabezado ----------
  const tabBtns = [];
  const tabs = h('nav', { class: 'lp-tabs', 'aria-label': 'Sections' }, TABS.map(([id, ic, label]) => {
    const b = h('button', { type: 'button', 'data-tab': id, onclick: () => show(id) }, icon(ic, { size: 16 }), h('span', {}, label));
    tabBtns.push(b);
    return b;
  }));
  const top = h('header', { class: 'lp-top' },
    h('div', { class: 'lp-left' }, brand()),
    tabs,
    h('div', { class: 'lp-right' }, langSwitch(), createInstallButton(), cta('btn primary small')));

  const beta = h('div', { class: 'lp-beta' }, h('span', { class: 'beta-chip' }, 'Beta'),
    h('span', {}, 'Public beta. We are still improving Pulse Studio, so some things may change.'));

  // ---------- panel de demo ----------
  const editor = new Editor({ value: '// Press play. The song writes itself.\n// Then change anything: edits land on the next bar.\n', onChange: () => player.sync() });
  const player = new Player(editor);
  const scope = createScope(player);
  let abort = null;
  const label = (name, text) => h('span', {}, icon(name, { size: 16 }), h('span', {}, text));
  const demoBtn = h('button', { class: 'btn primary big', type: 'button' });
  const skipBtn = h('button', { class: 'btn', type: 'button', hidden: true }, 'Skip typing');
  const status = h('span', { class: 'lp-status' }, 'Sound starts when you press play.');
  const consoleEl = h('div', { class: 'console' });

  const setIdle = () => { demoBtn.replaceChildren(label('play', 'Play demo')); demoBtn.classList.remove('playing'); skipBtn.hidden = true; consoleEl.classList.remove('live'); };
  setIdle();

  demoBtn.addEventListener('click', async () => {
    if (player.playing || abort) {
      abort?.abort();
      abort = null;
      player.stop();
      return setIdle();
    }
    abort = new AbortController();
    const mine = abort;
    demoBtn.replaceChildren(label('stop', 'Stop'));
    demoBtn.classList.add('playing');
    consoleEl.classList.add('live');
    skipBtn.hidden = false;
    status.textContent = 'Typing…';
    try {
      await window.Tone.start(); // necesita el gesto del clic
      await editor.typeIn(DEMO_SONG, {
        signal: mine.signal,
        onLine: async (text) => {
          const r = player.sync(text.slice(0, text.lastIndexOf('\n') + 1));
          if (r.ok && player.playable && !player.playing && !mine.signal.aborted) player.play();
        },
      });
      if (!mine.signal.aborted) {
        player.sync(editor.value);
        if (!player.playing) await player.play();
        status.textContent = 'Now it is yours: edit the code while it plays.';
      }
    } catch (e) {
      status.textContent = 'Could not start audio: ' + e.message;
    } finally {
      if (abort === mine) abort = null;
      skipBtn.hidden = true;
      if (!player.playing) setIdle();
    }
  });
  skipBtn.addEventListener('click', () => abort?.abort());
  player.on((e) => { if (e.type === 'state' && !e.playing && !abort) setIdle(); });

  const diag = h('div', { class: 'diag' }, h('span', { class: 'ok' }, '● live'));
  player.on((e) => {
    if (e.type !== 'parsed') return;
    diag.replaceChildren(...(e.result.errors.length
      ? e.result.errors.slice(0, 2).map((x) => h('div', { class: 'e' }, `line ${x.line}: ${x.message}`))
      : [h('span', { class: 'ok' }, '● ok')]));
  });
  consoleEl.append(
    h('div', { class: 'term-bar' }, h('i'), h('i'), h('i'), h('span', {}, 'demo.pulse')),
    editor.el, diag, scope.el,
    h('div', { class: 'console-foot' }, demoBtn, skipBtn, status));

  const chip = (ic, text) => h('li', {}, icon(ic, { size: 15 }), h('span', {}, text));
  const demoPanel = h('section', { class: 'lp-sec lp-hero', id: 'demo' }, h('div', { class: 'lp-inner lp-home' },
    h('div', { class: 'hero-copy' },
      h('h1', {}, 'Make music by ', h('em', {}, 'typing code.')),
      h('p', { class: 'lead' }, 'Write a few lines, hear them instantly, and keep editing while the track plays. Let AI draft the first idea, then export the full song, every track on its own, or a Reaper project.'),
      h('div', { class: 'cta' }, h('button', { class: 'btn primary big', type: 'button', onclick: () => { consoleEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (!player.playing && !abort) demoBtn.click(); } }, label('play', 'Watch it play itself')), cta('btn big')),
      h('ul', { class: 'chips' }, chip('code', 'Live coding'), chip('sparkles', 'AI drafts'), chip('layers', 'Tracks + Reaper'))),
    consoleEl));

  // ---------- funciones ----------
  const featuresPanel = h('section', { class: 'lp-sec', id: 'features' }, h('div', { class: 'lp-inner' },
    h('header', { class: 'lp-head' }, h('h2', {}, 'From first idea to finished track'), h('p', {}, 'A song is a short text file you can read, copy and share. There is no timeline to drag around.')),
    h('div', { class: 'flist' }, FEATURES.map(([ic, title, text]) => h('article', { class: 'fitem' },
      h('span', { class: 'ficon' }, icon(ic, { size: 22 })), h('div', {}, h('h3', {}, title), h('p', {}, text)))))));

  // ---------- sonidos ----------
  const pill = (n, label) => h('span', { class: 'pill' }, n === 'mic'
    ? h('span', { class: 'pill-ic' }, icon('mic', { size: 20 }))
    : h('img', { src: `/img/instruments/${n}.png`, alt: '', loading: 'lazy', width: 36, height: 36 }), h('span', label ? {} : { 'data-notranslate': '' }, label ?? n));
  const soundsPanel = h('section', { class: 'lp-sec', id: 'sounds' }, h('div', { class: 'lp-inner' },
    h('header', { class: 'lp-head' }, h('h2', {}, 'Built-in sounds, made in your browser'), h('p', {}, 'Drums and synths are generated live, so there is nothing to install and no samples to download.')),
    h('div', { class: 'slist' }, SOUND_GROUPS.map(([ic, name, blurb, items]) => h('article', { class: 'srow' },
      h('header', {}, h('span', { class: 'ficon small' }, icon(ic, { size: 18 })), h('div', {}, h('h3', {}, name), h('p', {}, blurb))),
      h('div', { class: 'pills' }, items.flatMap((n) => (n === 'voice' ? [pill('voice', 'AI voice'), pill('mic', 'Your mic')] : [pill(n)]))))))));

  // ---------- panel de planes ----------
  let yearly = false;
  const grid = h('div', { class: 'pgrid' });
  const billing = h('div', { class: 'billing', role: 'group', 'aria-label': 'Billing period' });
  const renderPlans = () => {
    billing.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(!yearly), onclick: () => { yearly = false; renderPlans(); } }, 'Monthly'),
      h('button', { type: 'button', 'aria-pressed': String(yearly), onclick: () => { yearly = true; renderPlans(); } }, 'Yearly', h('em', {}, '2 months free')));
    grid.replaceChildren(...PLANS.map((p) => h('article', { class: `plan${p.popular ? ' popular' : ''}` },
      p.popular ? h('span', { class: 'plan-badge' }, 'Most popular') : null,
      h('header', {}, h('span', { class: 'ficon' }, icon(p.icon, { size: 20 })), h('h3', {}, p.name)),
      h('p', { class: 'plan-blurb' }, p.blurb),
      h('div', { class: 'price' }, h('b', { 'data-notranslate': '' }, `$${yearly ? p.year : p.month}`), h('span', {}, p.month === 0 ? 'free while in beta' : yearly ? 'per year' : 'per month')),
      h('ul', {}, p.items.map((it) => h('li', {}, icon('check', { size: 16 }), h('span', {}, it)))),
      p.id === 'free' ? cta('btn primary') : h('button', { class: 'btn', type: 'button', disabled: true }, 'Available at launch'))));
  };
  renderPlans();
  const plansPanel = h('section', { class: 'lp-sec', id: 'plans' }, h('div', { class: 'lp-inner' },
    h('header', { class: 'lp-head' }, h('h2', {}, 'Plans for every stage'), h('p', {}, 'Pulse Studio is in beta, so access is free for now. Prices are in US dollars; paid plans start at launch.')),
    billing, grid));

  const panels = [demoPanel, featuresPanel, soundsPanel, plansPanel];
  const stage = h('main', { class: 'lp-stage' }, panels);

  // ---------- navegación inferior (celulares) ----------
  const bottom = h('nav', { class: 'lp-bottom', 'aria-label': 'Sections' }, TABS.map(([id, ic, text]) =>
    h('button', { type: 'button', 'data-tab': id, onclick: () => show(id) }, icon(ic, { size: 20 }), h('span', {}, text))));

  const mark = (id) => {
    for (const b of [...tabBtns, ...bottom.children]) b.setAttribute('aria-selected', String(b.dataset.tab === id));
    for (const b of bottom.children) b.setAttribute('aria-current', String(b.dataset.tab === id));
  };
  function show(id) {
    if (!TABS.some(([t]) => t === id)) id = 'demo';
    const el = panels.find((p) => p.id === id);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (id === 'demo') window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    else el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    history.replaceState({}, '', id === 'demo' ? location.pathname : `#${id}`);
    mark(id);
  }
  const spy = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) mark(e.target.id);
  }, { rootMargin: '-35% 0px -55% 0px' }) : null;
  panels.forEach((p) => spy?.observe(p));

  root.append(h('div', { class: 'lp' }, top, beta, stage, siteFooter(), bottom));
  mark('demo');
  const first = location.hash.slice(1);
  if (first && first !== 'demo') requestAnimationFrame(() => show(first));
  return () => { spy?.disconnect(); abort?.abort(); player.dispose(); scope.stop(); };
}
