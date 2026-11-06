import { h } from '../dom.js';
import { Editor } from '../editor.js';
import { Player, createScope } from '../player.js';
import { DEMO_SONG } from '/shared/lang/demo.js';
import { session, link, brand } from '../main.js';
import { APP_NAME } from '../config.js';

const INSTRUMENTS = ['kick', 'snare', 'clap', 'hat', 'openhat', 'perc', 'bass', 'sub', 'pad', 'lead', 'pluck', 'arp'];

export function mount(root) {
  const loggedIn = !!session.user;
  const nav = h('header', { class: 'nav' }, brand(), h('span', { class: 'spacer' }),
    h('a', { href: '#demo', class: 'btn ghost small' }, 'Try the demo'),
    loggedIn ? link('/studio', { class: 'btn primary small' }, 'Open studio') : link('/login', { class: 'btn primary small' }, 'Sign in'));

  const hero = h('section', { class: 'hero' }, h('div', {},
    h('h1', {}, 'Make music by ', h('em', {}, 'typing code.')),
    h('p', { class: 'lead' }, 'Write a few lines, hear them instantly, and keep editing while the track plays. Let AI draft the first idea, then export a mastered song with its stems.'),
    h('div', { class: 'cta' },
      h('a', { href: '#demo', class: 'btn primary big' }, '▶ Watch it play itself'),
      loggedIn ? link('/studio', { class: 'btn big' }, 'Open studio') : link('/login', { class: 'btn big' }, 'Sign in'))));

  // --- Demo: the song types itself and the music follows the code ---
  const editor = new Editor({ value: '// Press play. The song writes itself.\n// Then change anything: edits land on the next bar.\n', onChange: () => player.sync() });
  const player = new Player(editor);
  const scope = createScope(player);
  let abort = null;
  const demoBtn = h('button', { class: 'btn primary big', type: 'button' }, '▶ Play demo');
  const skipBtn = h('button', { class: 'btn', type: 'button', hidden: true }, 'Skip typing');
  const status = h('span', { class: 'muted mono' }, 'Sound starts when you press play.');

  const setIdle = () => { demoBtn.textContent = '▶ Play demo'; demoBtn.classList.remove('playing'); skipBtn.hidden = true; };

  demoBtn.addEventListener('click', async () => {
    if (player.playing || abort) {
      abort?.abort();
      abort = null;
      player.stop();
      return setIdle();
    }
    abort = new AbortController();
    const mine = abort;
    demoBtn.textContent = '■ Stop';
    demoBtn.classList.add('playing');
    skipBtn.hidden = false;
    status.textContent = 'Typing…';
    try {
      await window.Tone.start(); // needs the click gesture
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

  const term = h('div', { class: 'term' },
    h('div', { class: 'term-bar' }, h('i'), h('i'), h('i'), h('span', {}, 'demo.pulse')),
    editor.el,
    h('div', { class: 'diag', id: 'demo-diag' }, h('span', { class: 'ok' }, '● live')));
  player.on((e) => {
    if (e.type !== 'parsed') return;
    const d = term.querySelector('#demo-diag');
    d.replaceChildren(...(e.result.errors.length
      ? e.result.errors.slice(0, 3).map((x) => h('div', { class: 'e' }, `line ${x.line}: ${x.message}`))
      : [h('span', { class: 'ok' }, '● ok')]));
  });

  const demo = h('section', { class: 'section', id: 'demo' },
    h('h2', {}, 'Hear it before you sign up'),
    h('p', { class: 'sub' }, 'This is the real engine, running in your browser. Each line is an instrument; each quoted pattern is one bar.'),
    h('div', { class: 'demo' }, term,
      h('div', { class: 'demo-side' }, scope.el,
        h('div', { class: 'row' }, demoBtn, skipBtn), status,
        h('img', { class: 'demo-poster', src: '/img/demo-poster.jpg', alt: 'Illustration of code turning into sound', loading: 'lazy' }))));

  const feature = (img, title, text) => h('article', { class: 'card' }, h('img', { src: img, alt: '', loading: 'lazy' }), h('div', { class: 'pad' }, h('h3', {}, title), h('p', {}, text)));
  const features = h('section', { class: 'section alt' },
    h('h2', {}, 'Built for people who think in text'),
    h('p', { class: 'sub' }, 'No timeline to drag around. A song is a short file you can read, copy, version and share.'),
    h('div', { class: 'features' },
      feature('/img/feature-live-code.jpg', 'Live coding', 'Edit while it plays. Valid changes go live on the next bar and mistakes are highlighted without stopping the music.'),
      feature('/img/feature-ai.jpg', 'AI that writes code, not audio', 'Describe a mood and get an editable song back. You can read every line, change it and keep what you like.'),
      feature('/img/master-result.jpg', 'Mastered export', 'One click renders your song, balances loudness and gives you a ZIP with the master, the mix and one file per instrument.')));

  const step = (img, title, text) => feature(img, title, text);
  const steps = h('section', { class: 'section' },
    h('h2', {}, 'From idea to finished track'),
    h('div', { class: 'steps' },
      step('/img/step-1-type.jpg', 'Type or generate', 'Start from an empty file, the demo, or a sentence like “dark techno at 130 bpm”.'),
      step('/img/step-2-edit.jpg', 'Edit while it plays', 'Mute, solo, change a pattern or an effect and hear the result on the next bar.'),
      step('/img/step-3-export.jpg', 'Master and export', 'Pick a preset, press the button and download WAV, MP3, stems and the project file.')),
    h('img', { class: 'before-after', src: '/img/master-before-after.jpg', alt: 'A mix before and after mastering', loading: 'lazy' }));

  const instruments = h('section', { class: 'section alt' },
    h('h2', {}, 'Twelve instruments, all in the browser'),
    h('p', { class: 'sub' }, 'Drums and synths are generated live with the Web Audio API. Nothing to install and no samples to download.'),
    h('div', { class: 'instr-grid' }, INSTRUMENTS.map((n) => h('div', {}, h('img', { src: `/img/instruments/${n}.png`, alt: '', loading: 'lazy' }), n))));

  const footer = h('footer', { class: 'footer' }, h('span', {}, `${APP_NAME} · a Puma Code product`), h('span', { class: 'spacer' }),
    loggedIn ? link('/studio', {}, 'Open studio') : link('/login', {}, 'Sign in'));

  root.append(nav, hero, demo, features, steps, instruments, footer);
  return () => { abort?.abort(); player.dispose(); scope.stop(); };
}
