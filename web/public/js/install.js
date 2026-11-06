// "Install app": Chrome/Edge/Android show a native prompt; Safari (iOS and macOS) needs a manual step.
import { h, modal } from './dom.js';

let deferred = null;
const listeners = new Set();
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((fn) => fn());
});

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function manualHelp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const safariMac = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && !ios;
  const steps = ios
    ? 'Tap the Share button, then “Add to Home Screen”.'
    : safariMac
      ? 'In Safari choose File → Add to Dock.'
      : 'Open the browser menu (⋮) and choose “Install Pulse Studio” (or “Add to Home screen”).';
  modal({ title: 'Install Pulse Studio', body: h('p', {}, steps) });
}

// Returns a button. Hidden when the app is already installed.
export function createInstallButton(props = {}) {
  const btn = h('button', { class: 'btn small ghost install-btn', type: 'button', title: 'Install as an app', ...props }, '⬇ Install app');
  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      listeners.forEach((fn) => fn());
    } else manualHelp();
  });
  const sync = () => { btn.hidden = standalone(); };
  listeners.add(sync);
  sync();
  return btn;
}
