import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/geist-mono';
import './ui/styles.css';
import { render } from 'preact';
import { effect } from '@preact/signals';
import { App } from './app/App';
import { initRouter } from './app/router';
import { initMotion } from './ui/motion';
import { prefs } from './core/store';
import { loadMeals } from './slices/today/meals';
import { toast } from './app/toast';

function applyTheme(): void {
  const t = prefs.value.theme;
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'day' ? '#fbfbfa' : '#08090a');
}

effect(applyTheme);
initMotion();
initRouter();
void loadMeals();
render(<App />, document.getElementById('app')!);

// The Android app ships its files inside the APK, so only the web build needs the service worker.
const isNative = !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      const offer = (w: ServiceWorker) => toast('Update ready', { ms: 10000, action: { label: 'Reload', run: () => { w.postMessage('skip-waiting'); } } });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
    }).catch(() => { /* offline install unavailable; the app still works online */ });
    // Reload only when an update takes over, not when the first install claims the page.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
  });
}
